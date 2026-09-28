<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS

- Stock lives in `product_variants` (article × size); sales go only through the `create_sale` DB function so stock decrement is atomic and race-safe.
- Cost/profit are in separate owner-only tables (`product_costs`, `sale_costs`) because RLS can't hide columns from staff.
- Roles in `user_roles` (owner/staff); first signup becomes owner via trigger, later signups staff.
- Old JSON data imports via `legacy_id` upserts so re-imports never duplicate.
- Signed-in screens live under `src/routes/_authenticated/`; module list is defined once in `src/lib/modules.ts`.
