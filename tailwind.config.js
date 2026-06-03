/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#11211b',
        moss: { 50:'#f3f7f4',100:'#e3ede7',600:'#3f7a5f',700:'#2f5f49',800:'#264c3b' },
        sand: '#f6f4ee',
        clay: '#c2603b',
      },
    },
  },
  plugins: [],
}
