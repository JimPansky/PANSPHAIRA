// Actual separate executor process used only by the bounded kill/restart tests.
import { readFileSync } from 'node:fs';
import { createNativeUpdateExecutorV1 } from '../../src/pan463/native-update-executor.mjs';
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
try {
  const executor = createNativeUpdateExecutorV1({ ...config.options,
    readGrant: () => JSON.parse(readFileSync(config.grantFile, 'utf8')),
    observePhase: async (phase) => {
      if (phase === process.argv[3]) {
        process.send({kind:'phase',phase});
        await new Promise(() => {}); // Parent actually SIGKILLs this process.
      }
    },
  });
  const result = await executor.execute(config.request);
  process.send({kind:'result',result});
  process.disconnect();
} catch (error) {
  process.send({kind:'error',code:error.message});
  process.exitCode = 1;
  process.disconnect();
}
