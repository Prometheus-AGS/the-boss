import { object } from '../validation.mjs';
function decode(segment) {
    return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}
export function pointerValue(document, pointer) {
    if (pointer === '')
        return document;
    let current = document;
    for (const raw of pointer.split('/').slice(1)) {
        if (current === null || typeof current !== 'object')
            return undefined;
        const key = decode(raw);
        current = Array.isArray(current) ? current[Number(key)] : current[key];
    }
    return current;
}
export function setPointer(document, pointer, value) {
    const segments = pointer.split('/').slice(1).map(decode);
    if (!segments.length)
        throw new Error('A guided answer cannot replace a complete document');
    let current = document;
    for (const segment of segments.slice(0, -1)) {
        const existing = current[segment];
        if (existing === undefined)
            current[segment] = {};
        current = object(current[segment], `question target ${pointer}`);
    }
    current[segments.at(-1)] = structuredClone(value);
}
function seed(id, document, pointer, prompt) {
    return { id, document, pointer, prompt, required: true };
}
function seeds(manifestPath, definitions) {
    const result = [
        seed('manifest.provenance', manifestPath, '/provenance', 'What source and authors establish package provenance?'),
        seed('manifest.entrypoint', manifestPath, '/entrypoints', 'Which single TeamDefinition is the top-level package entrypoint?'),
    ];
    const teams = definitions.filter(item => item.document.kind === 'TeamDefinition');
    const agents = definitions.filter(item => item.document.kind === 'AgentDefinition');
    const workflows = definitions.filter(item => item.document.kind === 'WorkflowDefinition');
    for (const definition of teams) {
        const prefix = `team.${definition.document.id}`;
        result.push(seed(`${prefix}.members`, definition.path, '/members', `Which agents or nested teams belong to ${definition.document.id}?`), seed(`${prefix}.coordinator`, definition.path, '/coordinatorRole', `Which agent role coordinates ${definition.document.id}?`), seed(`${prefix}.communication`, definition.path, '/communication', `Which explicit role communication edges are allowed for ${definition.document.id}?`), seed(`${prefix}.acceptance`, definition.path, '/taskAcceptance/allowedWorkflows', `Which exact workflows may ${definition.document.id} accept?`), seed(`${prefix}.limits`, definition.path, '/limits', `Which aggregate limits constrain ${definition.document.id}?`), seed(`${prefix}.budget`, definition.path, '/budget', `Which aggregate budget constrains ${definition.document.id}?`));
    }
    for (const definition of agents) {
        const prefix = `agent.${definition.document.id}`;
        result.push(seed(`${prefix}.children`, definition.path, '/permittedChildren', `Which exact child agents may ${definition.document.id} invoke?`), seed(`${prefix}.skills`, definition.path, '/skills', `Which exact skill locks does ${definition.document.id} require?`), seed(`${prefix}.models`, definition.path, '/models', `Which model capabilities and aliases does ${definition.document.id} request?`), seed(`${prefix}.context`, definition.path, '/context', `Which bounded context may ${definition.document.id} receive?`), seed(`${prefix}.limits`, definition.path, '/requestedLimits', `Which limits constrain ${definition.document.id}?`));
    }
    for (const definition of workflows)
        result.push(seed(`workflow.${definition.document.id}.steps`, definition.path, '/steps', `Which finite role steps define ${definition.document.id}?`));
    result.push(seed('workspace.binding-intent', 'workspace.json', '/bindingIntent', 'Should deployment stop after package installation or prepare a private binding?'));
    return result;
}
function documentMap(manifestPath, manifest, definitions, bindingIntent) {
    return new Map([
        [manifestPath, manifest],
        ...definitions.map(item => [item.path, item.document]),
        ['workspace.json', { bindingIntent: bindingIntent ?? null }],
    ]);
}
export function questionState(manifestPath, manifest, definitions, bindingIntent, previous) {
    const documents = documentMap(manifestPath, manifest, definitions, bindingIntent);
    const prior = new Map(previous?.questions.map(question => [question.id, question]) ?? []);
    const questions = seeds(manifestPath, definitions).map((item) => {
        const value = pointerValue(documents.get(item.document), item.pointer);
        const accepted = prior.get(item.id)?.answer;
        const answer = value === undefined || value === null ? accepted : value;
        return { ...item, state: answer === undefined || answer === null ? 'pending' : 'answered', ...(answer === undefined || answer === null ? {} : { answer: structuredClone(answer) }) };
    });
    const currentQuestionId = questions.find(item => item.required && item.state === 'pending')?.id ?? null;
    return { currentQuestionId, questions };
}
