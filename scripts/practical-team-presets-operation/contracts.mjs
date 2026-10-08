export const cases = [
  { template: 'product-research', roles: ['coordinator', 'researcher', 'product', 'reviewer'],
    sections: { researcher: 'RESEARCH_EVIDENCE', product: 'PRODUCT_OPTIONS', reviewer: 'REVIEW_FINDINGS' }, run: true },
  { template: 'marketing-brand', roles: ['coordinator', 'brand', 'marketing', 'reviewer'],
    sections: { brand: 'BRAND_POSITIONING', marketing: 'CAMPAIGN_DRAFT', reviewer: 'REVIEW_FINDINGS' }, run: true },
  { template: 'logo-design', roles: ['coordinator', 'brand', 'designer', 'reviewer'],
    sections: { brand: 'VISUAL_BRIEF', designer: 'LOGO_HANDOFF', reviewer: 'REVIEW_FINDINGS' }, run: true },
  { template: 'mobile-design', roles: ['coordinator', 'ui-ux', 'mobile', 'reviewer'], run: false },
  { template: 'customer-feedback', roles: ['coordinator', 'product', 'documentation', 'reviewer'], run: false }
]
export const readOnlyInstructions =
  'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.'
export const readTools = ['filesystem__glob', 'filesystem__ls', 'filesystem__grep', 'filesystem__read']
export const fields = ['projectScope', 'outputInstructions', 'evidenceInstructions']
export const memberSelector = (role) => '[data-ui~="team-authoring-member"][data-role="' + role + '"]'
export const fieldSelector = (role, field) => memberSelector(role) + ' [data-ui~="team-authoring-' + field + '"]'
