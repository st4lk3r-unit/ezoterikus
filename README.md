> [!CAUTION]
> This app is currently under active development, thus `ezoterikus` can't be trusted as a reliable secured messaging software. Further work is needed


<br />
<div align="center">
  <a>
    <img src="https://github.com/st4lk3r-unit/ezoterikus/assets/ezoterikus.svg" alt="Logo" width="200" height="200">
  </a>

<h3 align="center">ezoterikus</h3>

  <p align="center">
    a zero-trust, paranoiac-ready messaging app.
    <br />
    <br />
    <a href="https://st4lk3r-unit.github.io/ezoterikus/">View Demo</a>
    &middot;
    <a href="https://github.com/st4lk3r-unit/ezoterikus/issues/new?labels=bug">Report Bug</a>
  </p>
</div>

## About The Project

**Ezoterikus** is a paranoia-ready messaging system where all security logic and state live on the client. Servers act only as blind relays: they see nothing beyond your IP, inbox slot, and opaque ciphertext. No profiles, no stored data, no server trust.

Trust is bootstrapped physically by exchanging *ezocards*, creating a root of authenticity that cannot be forged. If that’s not possible, you can always fall back on other tools like **Signal**, but **ezoterikus** is built for those who value sovereignty over convenience.

The current dev branch uses **ECDH with signatures** as a temporary bootstrap. The roadmap moves to **Double Ratchet**, eliminating signatures entirely for deniability. Future exploration includes **Elettra**: multi-container encrypted archives where different passwords unlock different plausible realities.

**ezoterikus** does **not** aim to cover every layer. For IP privacy, simply run it over Tor, I2P, or a VPN. The goal is narrow and clear: a lightweight, client-controlled messenger that anyone can deploy, prioritizing deniability, minimal footprints, and zero reliance on server trust, while openly trading ease of use for maximum privacy.