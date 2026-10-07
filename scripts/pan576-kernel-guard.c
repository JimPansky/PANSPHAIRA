// PAN576 finite Linux/amd64 workload profile, additive to the retained Docker
// reference invocation. No host/daemon/kernel compromise containment claim.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/landlock.h>
#include <linux/sched.h>
#include <linux/seccomp.h>
#include <node_api.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

static int add_path(int ruleset, const char *path, uint64_t access) {
    int fd = open(path, O_PATH | O_CLOEXEC);
    if (fd < 0) return -1;
    struct landlock_path_beneath_attr rule = {.allowed_access=access, .parent_fd=fd};
    int result = (int)syscall(__NR_landlock_add_rule, ruleset, LANDLOCK_RULE_PATH_BENEATH, &rule, 0);
    close(fd);
    return result;
}

#define DENY_NR(nr, error) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, nr, 0, 1), BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ERRNO|error)
static int seal_syscalls(void) {
    struct sock_filter instructions[] = {
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS, offsetof(struct seccomp_data, nr)),
        BPF_JUMP(BPF_JMP|BPF_JGE|BPF_K, 0x40000000, 0, 1),
        BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ERRNO|EPERM),
        // libuv threads may initialize after the seal; new processes may not.
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, __NR_clone, 0, 4),
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS, offsetof(struct seccomp_data, args[0])),
        BPF_JUMP(BPF_JMP|BPF_JSET|BPF_K, CLONE_THREAD, 0, 1),
        BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ALLOW),
        BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ERRNO|EPERM),
        // ENOSYS permits glibc's bounded thread-only clone fallback.
        DENY_NR(__NR_clone3, ENOSYS),
        DENY_NR(__NR_fork, EPERM), DENY_NR(__NR_vfork, EPERM),
        DENY_NR(__NR_execve, EPERM), DENY_NR(__NR_execveat, EPERM),
        DENY_NR(__NR_socket, EPERM), DENY_NR(__NR_socketpair, EPERM),
        DENY_NR(__NR_connect, EPERM), DENY_NR(__NR_bind, EPERM),
        DENY_NR(__NR_listen, EPERM), DENY_NR(__NR_accept, EPERM),
        DENY_NR(__NR_accept4, EPERM), DENY_NR(__NR_sendto, EPERM),
        DENY_NR(__NR_sendmsg, EPERM), DENY_NR(__NR_recvmsg, EPERM),
        DENY_NR(__NR_io_uring_setup, EPERM), DENY_NR(__NR_io_uring_enter, EPERM),
        DENY_NR(__NR_io_uring_register, EPERM), DENY_NR(__NR_ptrace, EPERM),
        DENY_NR(__NR_process_vm_readv, EPERM), DENY_NR(__NR_process_vm_writev, EPERM),
        DENY_NR(__NR_open_by_handle_at, EPERM), DENY_NR(__NR_pidfd_getfd, EPERM),
        DENY_NR(__NR_mount, EPERM), DENY_NR(__NR_umount2, EPERM),
        DENY_NR(__NR_bpf, EPERM), DENY_NR(__NR_perf_event_open, EPERM),
        DENY_NR(__NR_userfaultfd, EPERM),
        BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ALLOW),
    };
    struct sock_fprog program = {.len=(unsigned short)(sizeof(instructions)/sizeof(instructions[0])), .filter=instructions};
    return (int)syscall(__NR_seccomp, SECCOMP_SET_MODE_FILTER, SECCOMP_FILTER_FLAG_TSYNC, &program);
}

static napi_value seal(napi_env env, napi_callback_info info) {
    (void)info;
    long abi = syscall(__NR_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
    // All already-created Node/libuv threads must be restricted too. Never
    // silently substitute a current-thread-only rule or a JS permission flag.
    if (abi < 8) {
        napi_throw_error(env, "PAN576_KERNEL_PROFILE_UNAVAILABLE", "Landlock ABI8 and thread synchronization required");
        return NULL;
    }
    struct landlock_ruleset_attr policy = {
        .handled_access_fs=(1ULL<<16)-1,
        .handled_access_net=LANDLOCK_ACCESS_NET_BIND_TCP|LANDLOCK_ACCESS_NET_CONNECT_TCP,
        .scoped=LANDLOCK_SCOPE_ABSTRACT_UNIX_SOCKET|LANDLOCK_SCOPE_SIGNAL,
    };
    int ruleset = (int)syscall(__NR_landlock_create_ruleset, &policy, sizeof(policy), 0);
    const uint64_t read = LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_READ_DIR;
    const uint64_t write = read|LANDLOCK_ACCESS_FS_WRITE_FILE|LANDLOCK_ACCESS_FS_REMOVE_DIR|
        LANDLOCK_ACCESS_FS_REMOVE_FILE|LANDLOCK_ACCESS_FS_MAKE_DIR|LANDLOCK_ACCESS_FS_MAKE_REG|
        LANDLOCK_ACCESS_FS_MAKE_SYM|LANDLOCK_ACCESS_FS_REFER|LANDLOCK_ACCESS_FS_TRUNCATE;
    const char *readonly[] = {"/stage", "/artifact", "/usr/local/lib", "/usr/lib", "/lib", "/lib64"};
    int failed = ruleset < 0;
    if (!failed) {
        for (unsigned int i=0; i<sizeof(readonly)/sizeof(readonly[0]); i++)
            if (add_path(ruleset, readonly[i], read)) failed = 1;
        if (add_path(ruleset, "/scratch", write) || add_path(ruleset, "/output", write)) failed = 1;
        if (!failed && prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) failed = 1;
        if (!failed && syscall(__NR_landlock_restrict_self, ruleset, LANDLOCK_RESTRICT_SELF_TSYNC)) failed = 1;
        close(ruleset);
    }
    if (failed || seal_syscalls() != 0) {
        napi_throw_error(env, "PAN576_KERNEL_PROFILE_DENIED", "Required kernel policy could not be fully enforced");
        return NULL;
    }
    napi_value result;
    napi_create_int64(env, abi, &result);
    return result;
}

NAPI_MODULE_INIT() {
    napi_value function;
    napi_create_function(env, "seal", NAPI_AUTO_LENGTH, seal, NULL, &function);
    napi_set_named_property(env, exports, "seal", function);
    return exports;
}
