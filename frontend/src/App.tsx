import { Routes, Route } from "react-router-dom";
import { AppProvider } from "./store";
import Layout from "./components/Layout";
import ChatPage from "./pages/ChatPage";
import SwarmPage from "./pages/SwarmPage";
import ResultsPage from "./pages/ResultsPage";

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-arena-bg">
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ChatPage />} />
            <Route path="/swarm" element={<SwarmPage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Route>
        </Routes>
      </div>
    </AppProvider>
  );
}
