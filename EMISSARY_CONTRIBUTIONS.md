# Emissary contribution guide

This fork keeps `origin` pointed at `Emissaryx/killboard` and `upstream` pointed at `dalen/killboard`. Dalen and other Return of Reckoning developers do not need collaborator access or an emailed invitation to review or reuse this work.

## Upstream-safe workflow

1. Fetch both remotes.
2. Create a focused branch from `upstream/main`, never from this fork's long-running `main` branch.
3. Cherry-pick only the commits required by that feature.
4. Rebase the focused branch onto the latest `upstream/main`.
5. Run `npm test` and inspect the affected pages.
6. Push the branch to `origin` and open one pull request against `dalen/killboard` only when Dalen asks for it.

```bash
git fetch origin upstream
git switch --create contrib/<feature> upstream/main
git cherry-pick <commit>...
npm ci
npm test
git push --set-upstream origin contrib/<feature>
```

## Standalone feature repositories

The website tools are also maintained as independently pullable repositories. This is the simplest route when only one feature is wanted.

| Feature | Standalone repository | Primary killboard paths |
| --- | --- | --- |
| Class Activity | `Emissaryx/ror-class-activity` | `src/components/classActivity`, `src/pages/ClassActivity.tsx` |
| Creatures | `Emissaryx/ror-creatures` | `src/components/creature`, `src/pages/Creatures.tsx`, `src/pages/Creature.tsx` |
| Instances | `Emissaryx/ror-instances` | `src/components/instance_run`, `src/components/instance_statistics`, instance pages |
| Items | `Emissaryx/ror-items` | `src/components/item`, item pages |
| Loadout | `Emissaryx/ror-loadout` | standalone planner implementation |
| Quests | `Emissaryx/ror-quests` | quest pages and related catalogue components |
| Realm Rank | `Emissaryx/ror-realmrank` | realm-rank pages and components |
| Scenarios | `Emissaryx/ror-scenarios` | `src/components/scenario`, scenario pages |
| Skirmishes | `Emissaryx/ror-skirmishes` | `src/components/skirmish`, skirmish pages |

## Branch policy

`main` is the integrated Emissary preview and may contain several dependent features. Reusable upstream work belongs on `contrib/<feature>` branches based on the latest upstream commit. Do not mix formatting, dependency upgrades, navigation changes, or unrelated fixes into a contribution branch.

## Communication policy

Do not add Dalen, Max Hayman, or other Return of Reckoning developers as collaborators unless they explicitly request it. Public branches and pull-request links are the default handoff mechanism, avoiding automated invitation email.
