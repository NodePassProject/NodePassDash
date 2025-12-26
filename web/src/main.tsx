import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.tsx";
import { Providers } from "./provider.tsx";
import "@/styles/globals.css";

// 导入 fetch 拦截器，自动为所有 API 请求添加 JWT token
import "@/lib/fetch-interceptor";

// 在开发模式下给标题添加 -dev 后缀
declare global {
  const __DEV_MODE__: boolean;
}

if (__DEV_MODE__) {
  document.title = document.title + " - Dev";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Providers>
        <App />
      </Providers>
    </BrowserRouter>
  </React.StrictMode>,
);
