import { setTimeout as delay } from 'node:timers/promises';

/** Real onboarding interaction; no credentials, provider connection, or inference request. */
export default async function run({ evaluate, signal }) {
  const deadline = Date.now() + 30_000;
  let clicked = false;
  while (!clicked && Date.now() < deadline) {
    signal.throwIfAborted();
    clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(node =>
        node.innerText.trim() === 'Set up LLM Providers' && !node.disabled &&
        node.getAttribute('aria-disabled') !== 'true' && node.getBoundingClientRect().width > 0);
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) await delay(150, undefined, { signal });
  }
  if (!clicked) throw new Error('Fresh English onboarding did not expose the Set up LLM Providers action.');
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const opened = await evaluate(`(() => {
      const heading = [...document.querySelectorAll('h2')].find(node => node.innerText.trim() === 'Choose a Provider');
      if (!heading) return null;
      const providerPanel = heading.parentElement?.parentElement?.nextElementSibling;
      if (!providerPanel) return null;
      const actionable = [...providerPanel.querySelectorAll('input,button,[role="button"],[role="combobox"]')].filter(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return !node.disabled && node.getAttribute('aria-disabled') !== 'true' &&
          rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });
      return { heading: heading.innerText.trim(), actionableControls: actionable.length,
        inputs: actionable.filter(node => node.tagName === 'INPUT').length,
        buttons: actionable.filter(node => node.tagName === 'BUTTON' || node.getAttribute('role') === 'button').length };
    })()`);
    if (opened?.actionableControls > 0 && (opened.inputs > 0 || opened.buttons > 0)) {
      return {
        observedBehavior: 'Clicked Set up LLM Providers in fresh English onboarding; Choose a Provider opened with actionable provider administration controls. No provider connection or inference was performed.',
        passed: true,
      };
    }
    await delay(150, undefined, { signal });
  }
  throw new Error('Provider administration did not become actionable after the onboarding action.');
}
