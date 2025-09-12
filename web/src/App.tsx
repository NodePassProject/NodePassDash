import { Route, Routes } from "react-router-dom";
import DefaultLayout from "./layouts/default";

// 页面组件
import LoginPage from "./pages/login";
import DashboardPage from "./pages/dashboard";
import TunnelsPage from "./pages/tunnels";
import TunnelCreatePage from "./pages/tunnels/create";
import TunnelDetailsPage from "./pages/tunnels/details";
import EndpointsPage from "./pages/endpoints";
import SettingsPage from "./pages/settings";
import VersionHistoryPage from "./pages/settings/version-history";
import TemplatesPage from "./pages/templates";
import SetupGuidePage from "./pages/setup-guide";
import OAuthErrorPage from "./pages/oauth-error";
import DebugPage from "./pages/debug";
import EndpointDetailsPage from "./pages/endpoints/details";
import EndpointSSEDebugPage from "./pages/endpoints/sse-debug";
import ExamplesPage from "./pages/examples";

function App() {
  return (
    <DefaultLayout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/oauth-error" element={<OAuthErrorPage />} />
        <Route path="/setup-guide" element={<SetupGuidePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tunnels" element={<TunnelsPage />} />
        <Route path="/tunnels/create" element={<TunnelCreatePage />} />
        <Route path="/tunnels/details" element={<TunnelDetailsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/endpoints" element={<EndpointsPage />} />
        <Route path="/endpoints/details" element={<EndpointDetailsPage />} />
        <Route path="/endpoints/sse-debug" element={<EndpointSSEDebugPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/version-history" element={<VersionHistoryPage />} />
        <Route path="/docs" element={<ExamplesPage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    </DefaultLayout>
  );
}

export default App;
