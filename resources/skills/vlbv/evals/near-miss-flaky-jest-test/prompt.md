---
tags: [certification, trigger-negative]
max_turns: 15
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Jest test for formatCurrency passes on my laptop and fails about one run in five on the build server. It's a small utility library, nothing to do with any phase process. Here's the test:

    test('formats EUR', () => { expect(formatCurrency(1234.5, 'EUR')).toBe('1.234,50 €'); });

What are the likely causes?
