import { mount } from "svelte";

import ConsentDialog from "./lib/accounts/ConsentDialog.svelte";

import "./app.css";

// Dedicated entry: never mounts the account store, App, polling or auto-reconnect.
const target = document.getElementById("consent");
if (!target) throw new Error("Consent mount point missing");
mount(ConsentDialog, { target });
