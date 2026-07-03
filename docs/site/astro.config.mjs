import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://pizza-doc.dev',
  integrations: [
    starlight({
      title: 'Pizza Doc',
      description:
        'File-based architecture-as-code for systems that are too big to hold in your head but too small to deserve a wiki.',
      social: {
        github: 'https://github.com/pizza-doc/pizza-doc',
      },
      editLink: {
        baseUrl: 'https://github.com/pizza-doc/pizza-doc/edit/main/docs/site/',
      },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is Pizza Doc?', link: '/' },
            { label: 'Getting started', link: '/guides/getting-started/' },
            { label: 'Your first space', link: '/guides/your-first-space/' },
            { label: 'Spec change-sets', link: '/guides/change-sets/' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Spaces and entities', link: '/concepts/spaces-and-entities/' },
            { label: 'Use cases', link: '/concepts/use-cases/' },
            { label: 'The validation pipeline', link: '/concepts/validation-pipeline/' },
            { label: 'Data flow', link: '/concepts/data-flow/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'YAML format', link: '/reference/yaml-format/' },
            { label: 'Validation rules', link: '/reference/validation-rules/' },
            { label: 'CLI commands', link: '/reference/cli/' },
            { label: 'AI export format', link: '/reference/ai-export/' },
            { label: 'Keyboard shortcuts', link: '/reference/keyboard-shortcuts/' },
          ],
        },
        {
          label: 'Release notes',
          items: [{ label: 'v0.1.0', link: '/release-notes/v0.1.0/' }],
        },
      ],
    }),
  ],
})
