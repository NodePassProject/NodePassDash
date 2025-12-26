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
import OAuthSuccessPage from "./pages/oauth-success";
import DebugPage from "./pages/debug";
import EndpointDetailsPage from "./pages/endpoints/details";
import EndpointSSEDebugPage from "./pages/endpoints/sse-debug";
import ExamplesPage from "./pages/examples";
import IconComparisonPage from "./pages/icon-comparison";
import ServicesPage from "./pages/services";
import ServiceDetailsPage from "./pages/services/details";
import ServiceSSEPage from "./pages/services/sse";
import ServicesDemoPage from "./pages/services/demo";
import ServicesDetailsDemoPage from "./pages/services/demo/details";

function App() {
  return (
    <DefaultLayout>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<OAuthErrorPage />} path="/oauth-error" />
        <Route element={<OAuthSuccessPage />} path="/oauth-success" />
        <Route element={<SetupGuidePage />} path="/setup-guide" />
        <Route element={<DashboardPage />} path="/dashboard" />
        <Route element={<TunnelsPage />} path="/tunnels" />
        <Route element={<TunnelCreatePage />} path="/tunnels/create" />
        <Route element={<TunnelDetailsPage />} path="/tunnels/details" />
        <Route element={<TemplatesPage />} path="/templates" />
        <Route element={<EndpointsPage />} path="/endpoints" />
        <Route element={<ServicesPage />} path="/services" />
        <Route element={<ServicesDemoPage />} path="/services/demo" />
        <Route element={<ServicesDetailsDemoPage />} path="/services/demo/details" />
        <Route element={<ServiceDetailsPage />} path="/services/details" />
        <Route element={<ServiceSSEPage />} path="/services/sse" />
        <Route element={<EndpointDetailsPage />} path="/endpoints/details" />
        <Route element={<EndpointSSEDebugPage />} path="/endpoints/sse-debug" />
        <Route element={<SettingsPage />} path="/settings" />
        <Route element={<VersionHistoryPage />} path="/settings/version-history"/>
        <Route element={<ExamplesPage />} path="/docs" />
        <Route element={<DebugPage />} path="/debug" />
        <Route element={<IconComparisonPage />} path="/icon-comparison" />
        <Route element={<DashboardPage />} path="/" />
      </Routes>
    </DefaultLayout>
  );
}

export default App;
