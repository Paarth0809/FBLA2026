const forms = require('@tailwindcss/forms');
const containerQueries = require('@tailwindcss/container-queries');

module.exports = {
  content: [
    './public/**/*.html',
    './public/js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#006c49',
        'on-primary': '#ffffff',
        'primary-container': '#10b981',
        'on-primary-container': '#00422b',
        'surface-tint': '#006c49',
        surface: '#f4fbf4',
        background: '#f4fbf4',
        'on-background': '#161d19',
        'surface-bright': '#f4fbf4',
        'surface-dim': '#d4dcd5',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#eef6ee',
        'surface-container': '#e8f0e9',
        'surface-container-high': '#e3eae3',
        'surface-container-highest': '#dde4dd',
        'surface-variant': '#dde4dd',
        'on-surface': '#161d19',
        'on-surface-variant': '#3c4a42',
        outline: '#6c7a71',
        'outline-variant': '#bbcabf',
        'inverse-surface': '#2b322d',
        'inverse-on-surface': '#ebf3eb',
        'inverse-primary': '#4edea3',
        secondary: '#565e74',
        'secondary-container': '#dae2fd',
        'on-secondary-container': '#5c647a',
        tertiary: '#a43a3a',
        'tertiary-container': '#fc7c78',
        'on-tertiary-container': '#711419',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a'
      },
      fontFamily: {
        headline: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        'headline-md': ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        'headline-lg': ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        'headline-lg-mobile': ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        'display-lg': ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'label-sm': ['Inter', 'sans-serif'],
        'label-md': ['Inter', 'sans-serif']
      },
      fontSize: {
        'headline-lg-mobile': ['24px', { lineHeight: '1.3', fontWeight: '700' }],
        'display-lg': ['48px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '800' }],
        'headline-md': ['24px', { lineHeight: '1.4', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '1.2', fontWeight: '500' }],
        'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'headline-lg': ['32px', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '1.2', letterSpacing: '0.05em', fontWeight: '600' }]
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        gutter: '24px',
        unit: '4px',
        'container-max': '1280px'
      },
      maxWidth: {
        container: '1280px',
        'container-max': '1280px'
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      }
    }
  },
  plugins: [forms, containerQueries]
};
