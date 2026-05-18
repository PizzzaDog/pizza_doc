declare const __PIZZA_DOC_VERSION__: string

export const BUILD_VERSION =
  typeof __PIZZA_DOC_VERSION__ === 'string' ? __PIZZA_DOC_VERSION__ : '0.0.0'
