import { RootRoute, Route, Router } from '@tanstack/react-router'
import { EntityRoute } from './routes/EntityRoute'
import { Home } from './routes/Home'
import { Root } from './routes/Root'
import { SpaceLayout } from './routes/SpaceLayout'
import { SpacePlaceholder } from './routes/SpacePlaceholder'
import { Unsupported } from './routes/Unsupported'
import { UseCaseRoute } from './routes/UseCaseRoute'

// Code-based TanStack Router. Route paths match page 09 exactly.
// `/space/$spaceId` is a layout route with the sidebar; its children render
// inside the <Outlet/> on the right.
const rootRoute = new RootRoute({ component: Root })

const homeRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

const unsupportedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/unsupported',
  component: Unsupported,
})

const spaceLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/space/$spaceId',
  component: SpaceLayout,
})

const spaceIndexRoute = new Route({
  getParentRoute: () => spaceLayoutRoute,
  path: '/',
  component: SpacePlaceholder,
})

const entityRoute = new Route({
  getParentRoute: () => spaceLayoutRoute,
  path: 'entity/$refPath',
  component: EntityRoute,
})

const useCaseRoute = new Route({
  getParentRoute: () => spaceLayoutRoute,
  path: 'usecase/$useCaseId',
  component: UseCaseRoute,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  unsupportedRoute,
  spaceLayoutRoute.addChildren([spaceIndexRoute, entityRoute, useCaseRoute]),
])

export const router = new Router({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
