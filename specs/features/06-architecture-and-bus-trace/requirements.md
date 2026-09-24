# 06 · Architecture and bus trace: requirements

Sources: brief use case 4, the success criterion "The architecture is visible", roadmap phase 06 and DESIGN-RULES.md §7–8.

1. The nav rail's Architecture view (`network` icon) opens a panel with an ECU diagram and a CAN trace.
2. The diagram's nodes are exactly the ECUs that send or subscribe to catalogue messages in the running sim. Edges connect each message's sender to its subscribers. No ECU that is absent from the code is drawn.
3. Each node shows live activity. It is marked active if it sent a frame within a recent sim-time window, and idle otherwise. A sender whose transceiver is off is shown as inactive.
4. The trace lists recorded frames newest first. Each row shows the sim time (s), the CAN ID in hex, the message name and the sender, in Geist Mono with tabular numbers.
5. The trace can be filtered by ECU (sender) and by message. Filters combine with AND and can be cleared. If nothing matches, a plain empty state appears.
6. **Pause** freezes the displayed trace while the simulation keeps running. **Resume** shows the current trace again. The button labels are exactly **Pause**, **Resume** and **Clear trace**.
7. **Clear trace** empties the displayed trace, and newer frames appear after it. It does not reset the simulation, its ring buffer or any other view.
8. Selecting a frame shows each of its signals with name, value and unit (where defined). Enumerated signals show their value-table name, not a raw index.
9. Clicking an ECU node applies it as the trace's ECU filter. A selected frame highlights its sender and receivers in the diagram.
10. Frames from phases 02–05 can be seen and traced: the startup sequence to READY, drive and charging frames, and DTC frames from injected faults. A dropped message (`setMessageDropped`) does not appear.
11. The trace stays responsive while driving. It renders a bounded number of rows, and the 3D view and dashboard keep updating.
12. The phase adds no new packages. It does not change physics, message periods, timing, vehicle targets or reference tolerances. Existing views and e2e flows keep working.
13. The view works at 1366×768. Its controls can be used from the keyboard, focus is visible, and no state is shown by colour alone.
