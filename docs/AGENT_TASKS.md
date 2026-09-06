# Agent tasks and file ownership

Sol is not selectable on this collaboration surface. Recommended Sol tasks use available GPT-6 Astra agents; this is an explicit substitution, not a claim to run Sol. Terra and Luna are available by exact model ID. Root owns architecture, integration and final review.

| Task | Model / Reasoning level | Goal | Files | Dependencies | Acceptance Criteria | Can Run In Parallel |
|---|---|---|---|---|---|---|
| LUNA-01/02 | gpt-5.6-luna / high | Bootstrap, pinned dependencies and contracts | root configs/package*, apps/web configs, packages/shared/** | INTERFACES | npm install; shared types compile | Yes |
| TERRA-01/03/04 | gpt-5.6-terra / high | Korean dashboard, capture/job UI, editor, visitor | apps/web/app except api/**; apps/web/components except SceneCanvas.tsx | contract + renderer | create→upload→process→edit→save→reload→share UX | Yes |
| TERRA-02 | gpt-5.6-terra / high | persistent DB, secure API, job worker | apps/web/app/api/**, apps/web/lib/server/**, packages/db/**, scripts/worker.ts | contract | revision conflicts, private assets, immutable share, persisted jobs | Yes |
| SOL-01 (substitute) | gpt-6-astra / high | Real CPU reconstruction and measured plan | services/reconstruction/** | manifest + Scene | actual frames/SfM or honest failure; metric plan success | Yes |
| SOL-02/03 (substitute) | gpt-6-astra / high | Spatial math and R3F renderer | packages/three/**; apps/web/components/SceneCanvas.tsx | contract | meters, snapping, camera controls, bounds, no scaling art | Yes |
| LUNA-04/05 | gpt-5.6-luna / high | operational docs and verification fixtures | tests/**, README.md | implemented APIs | real reproducible E2E, clear limitations | After integration |

Root follows up with bounded tasks and exact ownership. Agents must not modify each other's owned files. No agent deploys, pays for external GPU or uploads original user media to third parties.
