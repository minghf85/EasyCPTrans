import ReactDOM from "react-dom/client";
import "../site.css";
import "./video.css";
import { VideoPage } from "./VideoPage";

document.documentElement.classList.add("promo-page");
document.body.classList.add("promo-page");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<VideoPage />);
