/** @type {import('tailwindcss').Config} */
import {heroui} from "@heroui/theme"

module.exports = {
  content: [
    "./index.html",
    './src/layouts/**/*.{js,ts,jsx,tsx,mdx}',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-inter)"],
      },
      // 添加 3D 变换支持
      perspective: {
        '1000': '1000px',
        '2000': '2000px',
      },
      // 添加背景模糊支持
      backdropBlur: {
        xs: '2px',
      },
      // 添加背景饱和度支持
      backdropSaturate: {
        150: '1.5',
      },
      // 添加自定义动画
      keyframes: {
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
      },
    },
  },
  darkMode: "class",
  plugins: [heroui({
      themes: {
        light: {
          colors: {
            primary: {
              50: "#eff6ff",
              100: "#dbeafe", 
              200: "#bfdbfe",
              300: "#93c5fd",
              400: "#60a5fa",
              500: "#3b82f6",
              600: "#2563eb",
              700: "#1d4ed8",
              800: "#1e40af",
              900: "#1e3a8a",
              950: "#172554",
              DEFAULT: "#3b82f6",
              foreground: "#ffffff",
            },
          },
        },
        dark: {
          colors: {
            primary: {
              50: "#eff6ff",
              100: "#dbeafe",
              200: "#bfdbfe", 
              300: "#93c5fd",
              400: "#60a5fa",
              500: "#3b82f6",
              600: "#2563eb",
              700: "#1d4ed8",
              800: "#1e40af",
              900: "#1e3a8a",
              950: "#172554",
              DEFAULT: "#3b82f6",
              foreground: "#ffffff",
            },
          },
        },
      },
    })],
  safelist: [
    // 日志 ANSI 颜色映射，需要在运行时动态插入
    'text-red-400',
    'text-green-400',
    'text-yellow-400',
    'text-blue-400',
    'text-purple-400',
    'text-cyan-400',
    'text-gray-400',
    'dark:text-red-400',
    'dark:text-green-400',
    'dark:text-yellow-400',
    'dark:text-blue-400',
    'dark:text-purple-400',
    'dark:text-cyan-400',
    'dark:text-gray-400'
  ],
};