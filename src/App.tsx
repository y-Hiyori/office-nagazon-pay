import { Outlet } from "react-router-dom";

function App() {
  return (
    <>
      <main style={{ width: "100%", minHeight: "100vh" }}>
        <Outlet />
      </main>
    </>
  );
}

export default App;