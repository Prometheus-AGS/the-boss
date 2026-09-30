import fs from 'node:fs';
import path from 'node:path';
import { relativeFile, text } from '../validation.mjs';
import { projectFile } from '../project-files.mjs';
import { compileUarPackage } from './compiler.mjs';
import { diffUarDirectories, diffUarPackages } from './maintenance.mjs';
import { writeUarPackage } from './package-files.mjs';
import { profileSchemaInfo } from './profile-validation.mjs';
import { answerWorkspaceQuestion, initializeWorkspace, loadWorkspace, reviseWorkspace, updateWorkspaceDocument, workspaceStatus } from './workspace.mjs';
export const uarAuthoringCommands = [
    'uar-workspace-init', 'uar-workspace-migrate', 'uar-workspace-status', 'uar-workspace-answer', 'uar-workspace-update', 'uar-workspace-revise',
    'uar-package-schema-info', 'uar-package-validate', 'uar-package-build', 'uar-package-diff',
];
function source(input) {
    if (input.workspace !== undefined) {
        const loaded = loadWorkspace(input);
        return { package: loaded.package, ...(loaded.migrationReceipt ? { receipt: loaded.migrationReceipt } : {}) };
    }
    return { package: input.package };
}
function outputDirectory(input) {
    if (input.project === undefined)
        return text(input.out, 'out');
    const project = fs.realpathSync(path.resolve(text(input.project, 'project')));
    return projectFile(project, relativeFile(text(input.out, 'out')));
}
export function dispatchUarAuthoring(command, input) {
    switch (command) {
        case 'uar-workspace-init':
        case 'uar-workspace-migrate': return initializeWorkspace(input);
        case 'uar-workspace-status': return workspaceStatus(input);
        case 'uar-workspace-answer': return answerWorkspaceQuestion(input);
        case 'uar-workspace-update': return updateWorkspaceDocument(input);
        case 'uar-workspace-revise': return reviseWorkspace(input);
        case 'uar-package-schema-info': return profileSchemaInfo();
        case 'uar-package-validate': {
            const selected = source(input);
            return { valid: true, package: compileUarPackage(selected.package, selected.receipt) };
        }
        case 'uar-package-build': {
            const selected = source(input);
            return writeUarPackage(outputDirectory(input), selected.package, selected.receipt);
        }
        case 'uar-package-diff': {
            if (input.beforeDirectory !== undefined || input.afterDirectory !== undefined)
                return diffUarDirectories(input.beforeDirectory, input.afterDirectory);
            if (input.beforeWorkspace !== undefined || input.afterWorkspace !== undefined) {
                const project = text(input.project, 'project');
                const before = loadWorkspace({ project, workspace: text(input.beforeWorkspace, 'beforeWorkspace') });
                const after = loadWorkspace({ project, workspace: text(input.afterWorkspace, 'afterWorkspace') });
                return diffUarPackages(before.package, after.package);
            }
            return diffUarPackages(input.before, input.after);
        }
        default: throw new Error(`Unknown UAR authoring command: ${command}`);
    }
}
export function isUarAuthoringCommand(command) {
    return uarAuthoringCommands.includes(command);
}
