import { createRoot } from "react-dom/client";
import "../shared/styles.css";
import App from "./App.jsx";

document.body.classList.add("patient");
createRoot(document.getElementById("root")).render(<App />);
// Service worker = the app shell keeps working with no network.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
