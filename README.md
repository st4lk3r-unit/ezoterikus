> [!CAUTION]
> This app is currently under active development, thus `ezoterikus` can't be trusted as a reliable secured messaging software. Further work is needed


<br />
<div align="center">
  <a>
    <img src="https://github.com/st4lk3r-unit/ezoterikus/assets/ezoterikus.svg" alt="Logo" width="400" height="400">
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

## Scope & Threat Model

> [!IMPORTANT]
> **ezoterikus is currently a proof of concept.**
> 
> This project is in its earliest stage. Nothing here should be considered secure, reliable, or production-ready.  
> 
> The goal at this point is to showcase a philosophy: maximum sovereignty, minimum trust, and radical client-side control.  
> 
> The code is experimental. Expect missing features, known weaknesses, and open questions.  
> 
> If your safety depends on absolute secrecy: do not use this software.

### Scope

- Client-side cryptography only: servers are blind relays with no authority or trust.  
- Focus on sovereignty and deniability, not on convenience.  
- Designed as a research project to explore workflows, not as a polished app.  
- Intended for experimentation and discussion, not for real-world secure communications.  

### Out of Scope (for the current PoC)

- Protection against state-level adversaries (NSA, NSO, 0-click exploits).  
- Protection against endpoint compromise (keyloggers, OS backdoors, forensic labs).  
- Resistance to global traffic analysis or timing correlation attacks.  
- Full usability for non-technical users.  
- Reproducible builds, signed releases, or production deployment.  

### Threat Model (current PoC)

Ezoterikus is **not** safe for life-critical secrecy.  
It is aimed at exploring scenarios such as:  

- **Moderate-risk environments** where reducing metadata and server trust lowers exposure.  
- **Research and experimentation** with concepts like blind relays, decoy workflows, and sovereignty-first messaging.  
- **Community review** of cryptographic design choices, trade-offs, and limitations.  

If your safety depends on absolute secrecy: **do not use this software**.  

## FAQs

### 🔒 Cryptography

</br>

<details>
<summary><b>Q: How solid is your crypto</b></summary>

</br>

We do not invent new cryptography. The project relies on established, widely used libraries. The goal is not novel algorithms but a workflow with minimum trust in third parties. The focus is sovereignty over convenience.

</details>

</br>

<details>
<summary><b>Q: How do I know your crypto is implemented correctly?</b></summary>

</br>

There is no paid audit or penetration testing. Security depends on community review. Anyone is welcome to test and contribute. This is open source: trust is built collectively, not purchased.

</details>

</br>

<details>
<summary><b>Q: What happens if your random number generator is weak?</b></summary>

</br>

Entropy quality is the responsibility of the host system. If your operating system or environment provides weak randomness, all security collapses. For stronger assurance, use hardware RNGs or audited entropy sources.

</details>

</br>

<details>
<summary><b>Q: Why not just fork Signal?</b></summary>

</br>

We already use libsignal for the Double Ratchet. Other crypto primitives come from well-established libraries. The project does not reinvent cryptography; it assembles proven components into a different trust model.

</details>

</br>

<details>
<summary><b>Q: Can I trust your dependencies?</b></summary>

</br>

We rely only on widely used libraries such as libsignal and libsodium. If those are compromised, the entire ecosystem (Signal, Tor, etc.) is also compromised. This is a shared risk, not unique to ezoterikus.

</details>

</br>

### 🕵️ Metadata and Network

</br>

<details>
<summary><b>Q: Blind relay ? you lie, relay know your info</b></summary>

</br>

By "blind relay" we mean the server only sees: an inbox ID (UUID), your IP (as is unavoidable on the internet), and ciphertext. No user profiles, no plaintext. If you expect the server not to log, you misunderstand the model: you should never trust the server.

</details>

</br>

<details>
<summary><b>Q: Can a relay operator log IPs and timestamps to build a social graph?</b></summary>

</br>

Yes. IPs and timestamps are sufficient to build correlations. Users should combine ezoterikus with Tor, VPN, or I2P to minimize metadata exposure. Mitigations are under research.

</details>

</br>

<details>
<summary><b>Q: What’s the threat model for state-level adversaries?</b></summary>

</br>

Ezoterikus is not designed to withstand NSA-level or vendor-zero-day attacks. It is intended to protect against lower-level adversaries such as ISPs, corporations, or moderate-risk environments. If your device is exploited by a state actor, no messenger will save you.

</details>

</br>

### 🧪 Under Research

</br>

<details>
<summary><b>Q: Can a global adversary perform traffic analysis on ezoterikus?</b></summary>

</br>

Yes. Traffic analysis and correlation attacks are unsolved in the current PoC. Mitigations are a subject of ongoing research but not yet implemented.

</details>

</br>

<details>
<summary><b>Q: How do you deal with timing correlation attacks?</b></summary>

</br>

Currently, there is no mitigation. Timing analysis remains a known weakness and is under research.

</details>

</br>

<details>
<summary><b>Q: Does using UUIDs for inbox slots leak anything over time?</b></summary>

</br>

Reuse of static inbox IDs can leak patterns. Rotation of UUIDs is on the roadmap.

</details>

</br>

### 💻 Device and Endpoint

</br>

<details>
<summary><b>Q: What if my device is compromised?</b></summary>

</br>

If your operating system is compromised (keylogged, exploited, etc.), no client-side cryptography can protect you. Ezoterikus does not address endpoint compromise.

</details>

</br>

<details>
<summary><b>Q: How do you protect keys in memory?</b></summary>

</br>

If your device is seized by a capable adversary, keys in memory or persistent storage can be extracted. Ezoterikus is not designed to resist full forensic analysis by state-level actors. The aim is plausible deniability and reduced suspicion in moderate-risk scenarios, not guaranteed survival under forensic seizure.

</details>

</br>

<details>
<summary><b>Q: What if someone forces me to hand over my device?</b></summary>

</br>

No tool can resist coercion or torture. Elettra and decoy passwords may delay suspicion, but against determined adversaries with physical control over you and your device, resistance is not realistic. Ezoterikus aims at delay and plausible deniability, not guaranteed protection against rubber-hose cryptanalysis.

</details>

</br>

### ⚙️ Usability and Scope

</br>

<details>
<summary><b>Q: No auto-update ?</b></summary>

</br>

This is intentional. Auto-update would allow a repository compromise to instantly spread to all users. If you want to stay updated, review commits before pulling code. If you see obfuscated or suspicious code, do not trust it.

</details>

</br>

<details>
<summary><b>Q: No auto-polling message by default</b></summary>

</br>

Correct. This reduces convenience but gives the user greater control over network footprint and avoids unnecessary traffic.

</details>

</br>

<details>
<summary><b>Q: Why no public server with the client demo</b></summary>

</br>

Because the client is meant to run on infrastructure you control. The live demo is only a proof of concept. If you want a full deployment, set up your own server. If someone chooses to host a public relay, it is their responsibility.

</details>

</br>

<details>
<summary><b>Q: Isn’t your UX so bad that users will misconfigure it?</b></summary>

</br>

This project is intended for users with a solid understanding of operational security. Misconfiguration or user error is outside the project’s scope.

</details>

</br>

<details>
<summary><b>Q: Why no forward secrecy yet?</b></summary>

</br>

The current PoC uses ECDH for simplicity. Forward secrecy will come with full Double Ratchet integration. This is early-stage development.

</details>

</br>

### 🌐 Deployment and Supply Chain

</br>

<details>
<summary><b>Q: Why should I trust your demo site isn’t serving modified code?</b></summary>

</br>

The demo site serves plain JavaScript. You can verify by viewing the source. If you see obfuscation or unexpected changes, do not trust it. Always verify against the repository.

</details>

</br>

<details>
<summary><b>Q: How do I verify I’m running the same code as in the repo?</b></summary>

</br>

At this stage, there are no reproducible builds or signed releases. Verification requires reviewing the source code yourself. Reproducible builds may come later.

</details>

</br>

<details>
<summary><b>Q: What if npm or GitHub injects malicious code?</b></summary>

</br>

Supply-chain attacks are real. Do not install blindly. Clone the repository, audit dependencies, or vendorize trusted components. Responsibility for build integrity lies with the operator.

</details>

</br>

<details>
<summary><b>Q: Does the browser version leak info via side-channels?</b></summary>

</br>

Yes. Browsers expose many side channels (timing, fingerprinting, storage). For higher assurance, use native builds when available. Do not expect full deniability in a browser environment.

</details>

</br>

<details>
<summary><b>Q: What about DoS attacks?</b></summary>

</br>

Relays can always deny service by dropping or flooding messages. Ezoterikus focuses on confidentiality, not availability.

</details>

</br>