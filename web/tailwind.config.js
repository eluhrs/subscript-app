/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                lehigh: { DEFAULT: '#6F5F58', dark: '#5A4D47' },
                brand: { blue: '#5B84B1', dark: '#4A6D94' },
            },
        },
    },
    plugins: [],
}
