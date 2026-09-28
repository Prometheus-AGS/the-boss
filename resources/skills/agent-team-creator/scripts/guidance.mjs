import { id, text, strings, target, object } from './validation.mjs';
export const questions = [
    { key: 'operation', question: 'Are you creating a team, revising a versioned team, or deploying an approved package?', choices: ['create', 'revise', 'deploy'] },
    { key: 'id', question: 'What short name should identify this team?' },
    { key: 'outcome', question: 'What should be different when this work is finished?' },
    { key: 'complexity', question: 'Is this one isolated change, or work spanning several components?', choices: ['simple', 'complex'] },
    { key: 'areas', question: 'Which kinds of work are involved?', choices: ['code', 'design', 'mobile', 'security', 'docs', 'marketing', 'product'] },
    { key: 'deliverables', question: 'What files, features, or decisions should the team deliver?' },
    { key: 'budget', question: 'Should we favor lower cost, balanced cost, or capability for difficult work?', choices: ['economy', 'balanced', 'quality'] },
    { key: 'review', question: 'Does this work need an independent reviewer?', choices: ['yes', 'no'] },
    { key: 'harness', question: 'Which coding tool will execute the team?' },
    { key: 'scope', question: 'Will the definitions live in this project, UAR, or BossFang?', choices: ['project', 'uar', 'bossfang'] },
];
const revisionQuestions = [
    questions[0],
    { key: 'state', question: 'Which existing team state or package is the source for this revision?' },
    { key: 'changeSummary', question: 'What membership, workflow, model, skill, or policy change is required?' },
    { key: 'nextVersion', question: 'What new semantic version will identify the immutable revision?' },
    { key: 'deploymentIntent', question: 'Should this revision remain local, be staged, or be deployed after review?', choices: ['local-only', 'stage', 'deploy'] },
];
const deploymentQuestions = [
    questions[0],
    { key: 'baseUrl', question: 'Which UAR instance URL should receive the package?' },
    { key: 'credentialRef', question: 'Which environment credential reference should authenticate the request (for example env:UAR_TOKEN)?' },
    { key: 'packageDirectory', question: 'Which reviewed compiled package directory should be deployed?' },
    { key: 'bindingIntent', question: 'Install only the immutable catalog package, or also preflight and install a private deployment binding?', choices: ['package-only', 'package-and-binding'] },
];
const specialists = {
    design: { id: 'designer', why: 'Decide layout, interaction and visual acceptance before implementation.', output: 'Design specification and assets', skills: ['prometheus-ui-ux'] },
    mobile: { id: 'mobile-specialist', why: 'Resolve platform navigation, accessibility and device constraints.', output: 'Mobile implementation plan', skills: ['prometheus-ui-ux'] },
    security: { id: 'security-reviewer', why: 'Review the actual trust boundaries and required controls.', output: 'Threat model and evidence-backed findings', skills: ['agent-runtime-security'] },
    docs: { id: 'documentation-specialist', why: 'Keep operator and developer instructions consistent with the delivered behavior.', output: 'Updated documentation', skills: ['documentation-and-adrs'] },
    marketing: { id: 'marketing-specialist', why: 'Develop audience, positioning and measurable campaign deliverables.', output: 'Campaign brief and copy', skills: ['brand'] },
    product: { id: 'product-manager', why: 'Translate desired outcomes into priorities and acceptance criteria.', output: 'Prioritized requirements', skills: ['domain-modeling'] },
};
export function guide(input) {
    const operation = (input.operation === undefined ? 'create' : String(input.operation));
    if (!['create', 'revise', 'deploy'].includes(operation))
        throw Error('operation must be create, revise, or deploy');
    if (operation === 'revise') {
        const required = ['state', 'changeSummary', 'nextVersion', 'deploymentIntent'];
        const missing = required.filter(key => input[key] === undefined);
        if (missing.length)
            return { operation, ready: false, missing, questions: revisionQuestions };
        const nextVersion = text(input.nextVersion, 'nextVersion');
        if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion))
            throw Error('nextVersion must be semantic version x.y.z');
        if (!['local-only', 'stage', 'deploy'].includes(String(input.deploymentIntent)))
            throw Error('Invalid deploymentIntent');
        return { operation, ready: true, questions: [], maintenance: {
                state: text(input.state, 'state'), changeSummary: text(input.changeSummary, 'changeSummary'), nextVersion,
                deploymentIntent: input.deploymentIntent,
                sequence: ['read-current-version', 'author-replacement', 'uar-package-diff', 'uar-package-validate', 'uar-package-build', 'preflight-before-install'],
                immutableRule: 'Changed content must use a new semantic version; existing catalog versions are never overwritten.',
            } };
    }
    if (operation === 'deploy') {
        const required = ['baseUrl', 'credentialRef', 'packageDirectory', 'bindingIntent'];
        const missing = required.filter(key => input[key] === undefined);
        if (missing.length)
            return { operation, ready: false, missing, questions: deploymentQuestions };
        if (!['package-only', 'package-and-binding'].includes(String(input.bindingIntent)))
            throw Error('Invalid bindingIntent');
        const credentialRef = text(input.credentialRef, 'credentialRef');
        if (!/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(credentialRef))
            throw Error('credentialRef must use env:VARIABLE');
        return { operation, ready: true, questions: [], deployment: {
                connection: { baseUrl: text(input.baseUrl, 'baseUrl'), credentialRef },
                packageDirectory: text(input.packageDirectory, 'packageDirectory'), bindingIntent: input.bindingIntent,
                sequence: ['uar-capabilities', 'uar-package-preflight', 'uar-package-install', ...(input.bindingIntent === 'package-and-binding' ? ['uar-binding-preflight', 'uar-binding-install'] : [])],
                activation: 'refused-until-I2',
            } };
    }
    const required = ['id', 'outcome', 'complexity', 'areas', 'deliverables', 'budget', 'review', 'harness', 'scope'];
    const missing = required.filter(k => input[k] === undefined);
    if (missing.length)
        return { operation, questions, missing };
    const teamId = id(input.id), outcome = text(input.outcome, 'outcome');
    const areas = strings(input.areas, 'areas'), deliverables = strings(input.deliverables, 'deliverables');
    if (!['simple', 'complex'].includes(String(input.complexity)))
        throw Error('complexity must be simple or complex');
    if (!['economy', 'balanced', 'quality'].includes(String(input.budget)))
        throw Error('Invalid budget preference');
    if (typeof input.review !== 'boolean')
        throw Error('review must be boolean');
    if (areas.some(a => !['code', ...Object.keys(specialists)].includes(a)))
        throw Error('Unknown work area');
    const harness = target(input.harness);
    if (harness === 'bossfang')
        throw Error('Use scope=bossfang and choose the executing harness separately');
    if (!['project', 'uar', 'bossfang'].includes(String(input.scope)))
        throw Error('Invalid scope');
    const tier = input.budget === 'quality' ? 'hard' : input.budget === 'economy' ? 'low' : 'medium';
    const roles = [{ id: 'implementer', description: 'Deliver the requested outcome within assigned scope.', prompt: `Deliver: ${outcome}. Coordinate ownership before editing. Report evidence and remaining work.`, skills: [], owns: [], inputs: ['Task and acceptance criteria'], outputs: deliverables, dependsOn: [], modelPolicy: { tier } }];
    const uiWork = areas.some(area => area === 'design' || area === 'mobile');
    if (uiWork)
        roles[0].skills.push('prometheus-ui-ux');
    const reasons = ['An implementer owns delivery. Assign concrete output paths before creating the team; suggested roles can be reduced.'];
    if (input.complexity === 'complex')
        for (const area of [...new Set(areas)]) {
            const spec = specialists[area];
            if (!spec)
                continue;
            roles.push({ id: spec.id, description: spec.why, prompt: `${spec.why} Outcome: ${outcome}. Stay within assigned scope and return concrete evidence.`, skills: spec.skills, owns: [], inputs: ['Task context'], outputs: [spec.output], dependsOn: [], modelPolicy: { tier: area === 'security' ? 'hard' : tier } });
            reasons.push(`${spec.id}: ${spec.why}`);
        }
    if (input.review) {
        roles.push({ id: 'reviewer', description: 'Independently verify acceptance criteria and code quality.', prompt: 'Inspect the delivered diff and actual verification evidence at the completed phase boundary. Report concrete defects; do not rewrite implementation while reviewing.', skills: ['code-review-and-quality', ...(uiWork ? ['prometheus-ui-review'] : [])], owns: [], inputs: ['Implementation diff', 'Verification evidence'], outputs: ['Review findings'], dependsOn: roles.map(r => r.id), modelPolicy: { tier: 'hard' } });
        reasons.push('An independent reviewer adds a separate verification pass and extra model cost.');
    }
    const ownership = input.ownership === undefined ? {} : object(input.ownership, 'ownership');
    for (const key of Object.keys(ownership))
        if (!roles.some(r => r.id === key))
            throw Error('Unknown ownership role: ' + key);
    for (const role of roles)
        if (ownership[role.id] !== undefined) {
            role.owns = strings(ownership[role.id], 'ownership.' + role.id);
            for (const owned of role.owns)
                if (owned.startsWith('/') || owned.includes('\\') || owned.includes(':') || owned.split('/').some(p => p === '..' || p === '.' || !p))
                    throw Error('Ownership must use project-relative paths or globs: ' + owned);
        }
    const unresolved = roles.filter(r => r.owns.length === 0);
    const alternatives = ['Use one implementer for sequential work; invoke specialist skills as needed.', 'Add parallel roles only where work and file ownership can be separated.'];
    const skillDiscovery = 'Skill names are suggestions, not installation claims. Discover installed AgentSkills, inspect their source and requirements, and replace or remove unavailable skills before export.';
    if (unresolved.length)
        return { operation, ready: false, proposedRoles: roles, reasons, alternatives, skillDiscovery,
            missing: unresolved.map(r => 'ownership.' + r.id),
            questions: unresolved.map(r => ({ key: 'ownership.' + r.id, question: 'Which project-relative files or output directories may ' + r.id + ' write? For read-only review, assign a separate findings path. Inspect the project and suggest paths instead of guessing.' })) };
    const team = { schemaVersion: 1, id: teamId, outcome, scope: input.scope, harness, roles, modelPolicy: { tier } };
    if (input.scope === 'uar') {
        const required = ['packageId', 'packageVersion', 'coordinatorRole', 'workflowSummary', 'communicationPolicy', 'aggregateLimits', 'aggregateBudget', 'bindingIntent'];
        const missing = required.filter(key => input[key] === undefined);
        const uarQuestions = [
            { key: 'packageId', question: 'What stable UAR package identity should own these agent, team, and workflow definitions?' },
            { key: 'packageVersion', question: 'What semantic version identifies this immutable package?' },
            { key: 'coordinatorRole', question: 'Which proposed role is the single fixed coordinator?' },
            { key: 'workflowSummary', question: 'What finite task dependencies, outputs, effects, approvals, and retry decisions should the workflow declare?' },
            { key: 'communicationPolicy', question: 'Which explicit role-to-role paths may queue a message or trigger a turn?' },
            { key: 'aggregateLimits', question: 'What aggregate concurrent-turn, member, nesting, and pending-task limits should the team request?' },
            { key: 'aggregateBudget', question: 'What aggregate token, cost, currency, and elapsed-time ceilings should the team request?' },
            { key: 'bindingIntent', question: 'Should creation stop after the immutable catalog package or also prepare a private deployment binding?', choices: ['package-only', 'package-and-binding'] },
        ];
        if (missing.length)
            return { operation, ready: false, proposedRoles: roles, reasons, alternatives, skillDiscovery, missing, questions: uarQuestions };
        const packageVersion = text(input.packageVersion, 'packageVersion');
        if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion))
            throw Error('packageVersion must be semantic version x.y.z');
        const coordinatorRole = id(input.coordinatorRole, 'coordinatorRole');
        if (!roles.some(role => role.id === coordinatorRole))
            throw Error('coordinatorRole must name a proposed role');
        if (!['package-only', 'package-and-binding'].includes(String(input.bindingIntent)))
            throw Error('Invalid bindingIntent');
        return { operation, ready: true, questions: [], team, reasons, alternatives, skillDiscovery, maintenance: {
                packageId: text(input.packageId, 'packageId'), packageVersion, coordinatorRole,
                workflowSummary: text(input.workflowSummary, 'workflowSummary'), communicationPolicy: text(input.communicationPolicy, 'communicationPolicy'),
                limits: object(input.aggregateLimits, 'aggregateLimits'), budget: object(input.aggregateBudget, 'aggregateBudget'), bindingIntent: input.bindingIntent,
                next: 'Author complete canonical documents with exact skill locks, model aliases, input/output contracts, and required capabilities, then run uar-package-validate.',
            } };
    }
    return { operation, ready: true, questions: [], team, reasons,
        alternatives, skillDiscovery };
}
