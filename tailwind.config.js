/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#ffd618', // POJ Yellow
                secondary: '#000000', // Black
            },
        },
    },
    plugins: [],
}
