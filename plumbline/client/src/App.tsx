import { Navigate, Route, Routes } from "react-router-dom";
import { useApp } from "./ctx";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewContent from "./pages/NewContent";
import Review from "./pages/Review";
import Knowledge from "./pages/Knowledge";

export default function App() {
  const { user } = useApp();
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewContent />} />
        <Route path="/doc/:id" element={<Review />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
