# 0004: Store User Plans Locally

Status: Accepted

The MVP stores sessions, projects/plans, and global new-plan defaults in local browser storage. It persists user configuration, objective settings, notes, and manual graph layout, not authoritative solver output.

Individual plans can be moved between browsers through explicit Beltwise JSON exports or compact share strings. Those transfer formats still contain user intent/configuration only; imported plans are solved again locally against the current generated dataset.
