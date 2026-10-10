// Shell presentation lifecycle only. These callbacks neither save nor authorize
// a proposal/effect. Native owners still validate every actual operation.
export interface WorkspaceDirtyDraftV1 {readonly id:'PERSONAL_MODULE_VIEW'|'PERSONAL_SHELL_PROFILE'|'AGENT_CONFIGURATION';readonly label:string;isDirty():boolean;discardForNavigation():Promise<boolean>}
export interface WorkspaceNavigationDriverV1 {guard(action:()=>void):void;manualNavigation():void;hashChange(acceptedHash:string,invalidate:()=>void,activate:()=>void):void;close():void}
