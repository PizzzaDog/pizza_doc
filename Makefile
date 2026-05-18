.PHONY: dev validate coverage orphans endpoints build typecheck test check gen-schemas

dev:
	pnpm --filter @pizza-doc/web dev

# Quality gates — run against SPACE=<id> or leave empty to auto-detect from cwd.
validate:
	pnpm pd validate $(if $(SPACE),spaces/$(SPACE),)

coverage:
	pnpm pd coverage $(if $(SPACE),spaces/$(SPACE),)

orphans:
	pnpm pd orphans $(if $(SPACE),spaces/$(SPACE),)

endpoints:
	pnpm pd endpoints $(if $(SPACE),spaces/$(SPACE),)

build:
	pnpm build

typecheck:
	pnpm typecheck

test:
	pnpm test

check:
	pnpm check

gen-schemas:
	pnpm gen:schemas
