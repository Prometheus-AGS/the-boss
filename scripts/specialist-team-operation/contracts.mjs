export const roles = ['coordinator', 'product', 'ui-ux', 'mobile', 'security', 'documentation', 'code-review']
export const fields = ['projectScope', 'outputInstructions', 'evidenceInstructions']
export const readOnlyInstructions =
  'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.'
export const memberSelector = (role) => '[data-ui~="team-authoring-member"][data-role="' + role + '"]'
export const fieldSelector = (role, field) => memberSelector(role) + ' [data-ui~="team-authoring-' + field + '"]'
export const delivery = (role) => ({
  projectScope: 'README.md',
  outputInstructions: role === 'coordinator'
    ? 'Synthesize the actual artifacts from all six specialists, retaining their exact delivery marker.'
    : 'Return a concise ' + role + ' assessment of README.md and its exact delivery marker. Return text only; do not write files.',
  evidenceInstructions: role === 'coordinator'
    ? 'Cite the actual specialist artifacts and their exact delivery marker. Mark unperformed checks as not run.'
    : 'Read README.md directly with filesystem__read and cite its exact delivery marker. Mark unperformed checks as not run.'
})
