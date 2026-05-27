# RFC: Logistics Route Planning

Status: Draft research

## Summary

Logistics should become a session-level planning layer after basic linked factory
plans are useful. Linked-plan contracts say what should move between factories:
item, rate, source, and destination. Logistics routes say how that movement is
expected to happen, and whether the route looks balanced, short, overfed, or
over capacity.

The first logistics model should treat truck, train, drone, belt, and pipe
routes as optional tracking and diagnostic objects. They should not be hard
solver constraints at first. A user should be allowed to model an imbalanced
route, then see whether it is net positive, net negative, unrouted, or likely to
back up/starve in-game.

Later save analysis should inspect a real save with vehicle and train routes to
learn which route names, stations, timetables, platform settings, coordinates,
travel times, inventories, and fuel details can be extracted reliably.

## Goals

- Keep factory links and logistics routes separate in the data model.
- Let multiple factories load into one route and multiple factories unload from
  it.
- Model logistics routes as moving buffers with per-item balance, not as hard
  point-to-point pipes.
- Support vehicles, trains, drones, belts, and pipes without forcing the first
  route UI to understand every transport detail.
- Show net surplus or shortage by item so users know whether to increase
  production, add consumers, sink excess, or split routes.
- Leave room for save-derived route and map data later.

## Non-Goals

- Do not delay basic linked-plan editing on logistics.
- Do not require save import for manual routes.
- Do not make logistics routes coordinate or recursively solve plans.
- Do not block users from saving imbalanced or over-capacity route intent.
- Do not promise exact in-game throughput until route timing and loading
  assumptions have been validated against saves.
- Do not make the graph renderer own logistics domain state.

## Boundary: Links Versus Routes

Linked-plan contracts should remain supply intent:

```ts
PlannerSessionLink
  sourcePlanId
  destinationPlanId
  itemId
  amountPerMinute
```

A logistics route is an optional transport layer:

```ts
LogisticsRoute
  mode: 'vehicle' | 'train' | 'drone' | 'belt' | 'pipe' | 'manual'
  stops[]
  allocations[]
```

This separation protects the basic link UI. A link can exist without a route,
and a route can later carry one or more link allocations. The UI should avoid
phrases like "belt between factories" for generic links. Better labels are
"linked supply", "reserved output", "external supply", and "unrouted supply".

## Route As Moving Buffer

Vehicles, trains, and drones behave more like buffers over time than perfect
continuous pipes. A route can be fed by several factories, drained by several
other factories, and temporarily absorb mismatch through station and vehicle
inventory.

The useful first diagnostic is per-item balance:

```ts
interface LogisticsRouteBalanceItem {
  itemId: ItemId;
  loadedAmountPerMinute: number;
  unloadedAmountPerMinute: number;
  netAmountPerMinute: number;
  estimatedCapacityPerMinute?: number;
  status: 'balanced' | 'surplus' | 'shortage' | 'over-capacity';
}
```

Where:

- Positive net means the route is being fed more than it is drained. In-game it
  may back up unless another consumer or sink uses the excess.
- Negative net means the route is being drained more than it is fed. In-game it
  may starve destinations unless production increases.
- Capacity warnings are diagnostics. They should not reject the route.
- An unrouted link remains valid session intent, but should be visible as
  unassigned/manual supply.

## Conceptual Data Shape

The exact persisted shape can wait, but the model should likely separate routes,
stops, equipment assumptions, and allocations:

```ts
interface LogisticsRoute {
  id: string;
  name: string;
  mode: LogisticsRouteMode;
  stops: readonly LogisticsStop[];
  allocations: readonly LogisticsRouteAllocation[];
  equipment?: LogisticsRouteEquipment;
  notes?: string;
}

type LogisticsRouteMode = 'vehicle' | 'train' | 'drone' | 'belt' | 'pipe' | 'manual';

interface LogisticsStop {
  id: string;
  name: string;
  projectId?: string;
  location?: PlannerMapPoint;
}

interface LogisticsRouteAllocation {
  id: string;
  linkId?: string;
  itemId: ItemId;
  amountPerMinute: number;
  loadStopId: string;
  unloadStopId: string;
}
```

Allocations may start as manual rows and later attach to `PlannerSessionLink`
records. A route balance selector can derive loaded, unloaded, net, and capacity
status without persisting those results as authoritative state.

## Vehicle Routes

Working assumptions to verify later:

- Vehicle routes use invisible paths/tracks.
- A vehicle has one inventory.
- A truck station stop is configured to load or unload, not both.
- "None" is a valid effective operation when a station should not transfer a
  given item or cargo type.
- Tractors and trucks carry items.
- Fluid trucks carry fluids.
- Multiple vehicles can run the same route to increase throughput.

The first route model can avoid vehicle counts by letting users enter rates
directly. Later, vehicle count, inventory capacity, stack size, and estimated
cycle time can derive a capacity warning.

```ts
interface VehicleRouteStop extends LogisticsStop {
  operation: 'load' | 'unload' | 'none';
}
```

## Train Routes

Train logistics need a more detailed stop model because trains have car slots
and matching platforms.

Working assumptions to verify later:

- A train can have item freight cars and fluid freight cars.
- A train can mix item and fluid cars in the same consist.
- Each station has platforms that line up with car positions.
- A platform/car position can load, unload, or do nothing at a station.
- A single platform/car position cannot load and unload at the same time.
- Different car positions at the same station can perform different operations.
- Empty platforms or missing platforms effectively produce no transfer for that
  car at that stop.

```ts
interface TrainRouteEquipment {
  cars: readonly TrainCar[];
}

interface TrainCar {
  position: number;
  cargoKind: 'item' | 'fluid';
}

interface TrainRouteStop extends LogisticsStop {
  platforms: readonly TrainPlatformOperation[];
}

interface TrainPlatformOperation {
  carPosition: number;
  operation: 'load' | 'unload' | 'none';
  cargoKind: 'item' | 'fluid' | 'empty';
}
```

Route validation can later check that item allocations use item cars and fluid
allocations use fluid cars. Capacity can be derived per car/platform only after
cycle time and cargo capacity assumptions are reliable.

## Drone Routes

Working assumptions to verify later:

- Drones are fast and low-capacity compared with trains.
- Drones likely start as a two-port route model unless save/game testing proves
  richer routing is available.
- Drone fuel should remain optional until consumption and timing can be
  estimated accurately.

The first model can represent drones as manual item throughput between two
stops. Later, port pairing, battery or fuel requirements, cargo capacity, and
flight time can produce warnings.

## Fuel And Power

Vehicle and drone fuel is real, but it should not block the first logistics
tracking pass. Fuel can start as notes or optional manual rates:

```ts
interface LogisticsFuelAssumption {
  fuelItemId: ItemId;
  amountPerMinute?: number;
}
```

If route timing becomes reliable, fuel can become a derived route requirement
or a normal linked input to a logistics route. Until then, Beltwise should avoid
claiming exact fuel burn.

## UX Direction

The first logistics UI should be practical and tabular:

- Route list with name, mode, notes, and warning badges.
- Route detail table grouped by item: loaded, unloaded, net, and optional
  capacity.
- Allocations table showing source stop, destination stop, item, amount/min, and
  linked contract when present.
- "Unrouted linked supply" summary so users can see which links have no route
  assignment.
- Later session overview where factory plans, routes, shared pools, and sinks
  become high-level nodes.

On a map, a logistics route may initially appear as a node or schematic edge.
Rendering real train loops or vehicle paths should wait for save data research
and a map boundary. The strategic value is route balance first, not exact track
geometry.

## Save Analysis Questions

A later save-analysis pass should answer:

- Are train route names, timetables, stations, and stop order available?
- Are train car consists and platform load/unload settings available?
- Are truck/tractor routes, station names, and station load/unload settings
  available after the vehicle route changes?
- Are drone ports paired or routable beyond back-and-forth operation?
- Are route travel times available directly, or must they be estimated?
- Are station inventories useful enough to infer current route imbalance?
- Are fuel inventories or fuel consumption rates available and stable enough to
  model?
- Are map coordinates for stations and route paths reliable enough for a
  session map?
- Can imported logistics be treated as draft route intent that users correct?

## Suggested Sequence

1. Finish basic linked-plan editing before implementing logistics routes.
2. Add session balance from linked plans: produced, imported, exported,
   unlinked/manual, overcommitted, and short.
3. Add an RFC-backed save analysis task using a save with trains and vehicles.
4. Add a manual route table with route mode, stops, allocations, and per-item
   balance.
5. Let links optionally attach to route allocations.
6. Add a schematic session overview with routes as first-class selectable
   objects.
7. Add mode-specific helpers for trains, vehicles, and drones only after manual
   route tracking proves useful.
8. Add save-derived route drafts and map placement once the parser boundary is
   reliable.

## Open Questions

- Should links attach directly to routes, or to route allocations?
- Should shared depots/item pools be separate objects or route-like nodes?
- Should route balance treat sinks as explicit unload destinations?
- Should route capacity be manually entered first, derived first, or both?
- How should Beltwise display a route that is balanced by inventory drain for a
  short time but negative in steady state?
- Should fuel become a route requirement, a linked input, or an optional note?
- What is the smallest map view that helps logistics without becoming a full
  save-map clone?
