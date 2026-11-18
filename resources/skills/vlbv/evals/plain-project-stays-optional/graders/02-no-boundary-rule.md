---
type: regex
pattern: "\\bB4\\b|boundary packet|value-phase boundary|\\bVLBV\\b"
flags: i
match: not_contains
target: last_message
weight: 1
arm: both
---
