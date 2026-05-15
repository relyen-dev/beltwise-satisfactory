# 0002: Use Foblex Flow Behind A Graph Renderer Boundary

Status: Accepted

Use Foblex Flow for the first Angular graph renderer, but keep persisted graph data and planner-core graph models renderer-agnostic. Renderer-specific types belong only in `apps/web/src/features/graph`.
