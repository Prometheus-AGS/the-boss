import type { Json, ObjectValue } from '../types.mjs';
import { UAR_PROFILE_V2 } from '../types.mjs';
import { object, text } from '../validation.mjs';
import { cloneObject, selfDigest } from './canonical.mjs';
import { assertBindingContainsReferencesOnly, assertOpaqueReference } from './private-authority.mjs';
import { validateProfileDocument } from './profile-validation.mjs';

export function compileUarBinding(value: unknown): ObjectValue {
  const binding = cloneObject(value, 'deployment binding');
  if (binding.profile !== UAR_PROFILE_V2 || binding.kind !== 'DeploymentBinding') throw new Error(`deployment binding must use profile ${UAR_PROFILE_V2} and kind DeploymentBinding`);
  assertBindingContainsReferencesOnly(binding as Json);
  const packageReference = object(binding.package, 'binding.package');
  for (const field of ['id','version','digest']) text(packageReference[field], `binding.package.${field}`);
  if (!Array.isArray(binding.modelBindings) || binding.modelBindings.length === 0) throw new Error('binding.modelBindings must be a nonempty array');
  binding.modelBindings.forEach((entry, index) => {
    const model = object(entry, `binding.modelBindings[${index}]`);
    assertOpaqueReference(model.credentialRef, `/modelBindings/${index}/credentialRef`);
  });
  const storage = object(binding.storage, 'binding.storage');
  assertOpaqueReference(storage.connectionRef, '/storage/connectionRef');
  if (!Array.isArray(binding.representationGrantRefs)) throw new Error('binding.representationGrantRefs must be an array');
  binding.representationGrantRefs.forEach((entry, index) => {
    const reference = object(entry, `binding.representationGrantRefs[${index}]`);
    text(reference.id, `binding.representationGrantRefs[${index}].id`);
    if (!Number.isSafeInteger(reference.revision) || Number(reference.revision) < 0) throw new Error(`binding.representationGrantRefs[${index}].revision must be a nonnegative integer`);
  });
  const supplied = binding.contentDigest;
  delete binding.contentDigest;
  const digest = selfDigest(binding);
  if (supplied !== undefined && supplied !== digest) throw new Error('DeploymentBinding contentDigest conflict');
  binding.contentDigest = digest;
  validateProfileDocument(binding);
  return binding;
}
