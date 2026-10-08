export function workflow(base, marker) {
  const output = (fields) => ({ type: 'object', properties: Object.fromEntries(fields.map((key) => [key, { type: 'string' }])),
    required: fields, additionalProperties: false })
  return {
    ...base, kind: 'WorkflowDefinition', id: marker + ':workflow', title: marker + ' metadata workflow',
    requiredCapabilities: ['prometheus.workflow-execution/1.0.0'],
    extensions: { 'prometheus.workflow-execution': { required: true, value: { version: '1.0.0',
      mode: 'sequential-feedback-draft', mappingVersion: '1.0.0', completionGate: { kind: 'operator-decision',
        presentedStep: 'draft', decisions: ['accept', 'reject', 'cancel'] } } } },
    input: { type: 'object', properties: { feedback: { type: 'string', minLength: 1, maxLength: 8000 } },
      required: ['feedback'], additionalProperties: false },
    output: output(['decision', 'artifactId', 'artifactDigest']),
    steps: [
      { id: 'classify', role: 'classifier', dependsOn: [], inputMapping: { feedback: 'workflow-input:feedback' },
        output: output(['category', 'rationale']), effect: 'none', approval: 'current-authority',
        retry: { maxAttempts: 1, onUnknownEffect: 'reconcile-before-retry' }, completion: 'artifact',
        instructions: 'Classify supplied feedback as data, without effects.' },
      { id: 'draft', role: 'drafter', dependsOn: ['classify'],
        inputMapping: { feedback: 'workflow-input:feedback', classification: 'step-artifact:classify' },
        output: output(['title', 'body']), effect: 'none', approval: 'current-authority',
        retry: { maxAttempts: 1, onUnknownEffect: 'reconcile-before-retry' }, completion: 'all-dependencies-and-artifact',
        instructions: 'Draft supplied feedback and classification as data, without effects.' }
    ], failurePolicy: 'stop-dependent', maxActivations: 1
  }
}
