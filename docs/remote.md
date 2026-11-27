# Using Aubergine from elsewhere

This guide is for using Aubergine from a device other than the computer it runs on: your phone, a second computer, or a laptop that talks to a cloud machine. Read it top to bottom the first time. Each part after the first three stands on its own.

## The short version

**It is off by default.** A fresh install answers only on the computer it runs on. It listens on `127.0.0.1`, which is that computer talking to itself, and nothing on the network can reach it. That does not change.

Three things turn on use from elsewhere:

1. **Tell Aubergine its name.** Write the HTTPS address other devices will use under `access.addresses` in `config.json`, and start the server again.
2. **Put HTTPS in front of it.** Something on the same machine accepts HTTPS under that name and passes each request on to Aubergine at `127.0.0.1`.
3. **Pair each browser** with a one-time code. Each browser you pair is a **device**, with a sign-in of its own that you can revoke.

There is one way that needs none of this: an SSH tunnel from your laptop to a cloud machine. See [Way 1](#way-1-an-ssh-tunnel).

**A device is the whole owner.** A paired device has what you have at the computer: every terminal, so a shell on that machine as you. Pair only browsers you would hand your keyboard to.

## Words used here

- **The server** is the program you start with `aubergine start`. It owns the terminals. Every shell and every agent is a process on the machine the server runs on, and its files are that machine's files.
- **The page** is what you see in the browser. It is only a view. It can be open anywhere that can reach the server, and closing it stops nothing.
- **"On your laptop"** and **"on a cloud instance"** say where the *server* runs, not where you look at it. "On your laptop" means you ran `aubergine start` on your laptop, so the terminals are on your laptop. "On a cloud instance" means you ran it on a rented machine at a cloud provider, so the terminals are there, and your laptop only shows the page.
- **An IP address** is the number that finds a machine on a network, like `203.0.113.10`.
- **A name** is something like `aubergine.example.net`. It works because a **DNS record** says which IP address the name points at. You get a name by owning a domain, or from a service that gives out names (see [Getting a name](#getting-a-name)).
- **HTTPS** is the encrypted form of a web address. It needs a **certificate**: a file that proves the machine really is the name in the address. Browsers warn, or refuse, when there is none they trust.
- **A proxy** here is a small web server on the same machine as Aubergine. It accepts HTTPS from the network and passes each request to Aubergine at `127.0.0.1`. Aubergine never speaks HTTPS itself.
- **An origin** is the first part of an address: the scheme, the name and the port. `https://aubergine.example.net` and `http://127.0.0.1:4600` are origins. `https://aubergine.example.net/c/123` is not; its origin is `https://aubergine.example.net`.
- **A device** is one browser you paired, with its own sign-in.
- **A pairing code** is ten letters and digits, shown as two groups of five, like `7K2QD-M9XPA`. It works once, for three minutes.
- **A linked server** is another Aubergine whose projects your page also shows. See [Two servers in one page](#two-servers-in-one-page).

In every example, **`aubergine.example.net` is a placeholder** for a name of your own. It is not an IP address and not a real site. `203.0.113.10` is a placeholder IP address, from a range kept for examples.

## Which way to choose

| Your situation | The way |
|---|---|
| Only me, from my laptop, to Aubergine on a cloud instance | [Way 1: an SSH tunnel](#way-1-an-ssh-tunnel). Nothing to configure. |
| Only me, phone included, to Aubergine on my laptop or on a cloud instance | [Way 2: a private network](#way-2-a-private-network) that gives the machine an HTTPS name |
| Other people later, or a browser with nothing installed | [Way 3: a name of your own and a proxy](#way-3-a-name-of-your-own-and-a-proxy) |
| A work laptop where tunnels and private networks are not allowed | Run the server on a machine your organisation lets you reach, and use the way it allows. This guide is not a way round such a rule. |

## Laptop or cloud instance

|  | Server on your laptop | Server on a cloud instance |
|---|---|---|
| Where the terminals and files are | On your laptop | On the instance. Your laptop's files are not there. |
| When the lid closes | The laptop sleeps, so does every terminal, and no other device can reach it until it wakes. The terminals carry on when it wakes. | Nothing changes. Terminals keep running. |
| From a phone | Only while the laptop is awake, and through a private network or a proxy | Through a private network or a proxy |
| Sign-in | At the laptop: the access token, as always. From elsewhere: paired devices only. | Through an SSH tunnel: the access token. Under an outside address: paired devices only. |
| Left out when you are not at the computer | Under an outside address the page leaves out what acts on that computer's desktop: **Open on desktop**, the box for it in the dialogs, its setting, and the terminals open outside the canvas. | Under an outside address, the same. Through an SSH tunnel nothing is left out, but an instance usually has no desktop for it to use. |
| Cost and upkeep | Nothing extra | You pay for the instance each month, and you keep its system up to date |
| How well it has been tried | macOS is used every day | Linux has been run once, in the container below, on a Mac; never on a cloud instance |

**A window on the desktop is never opened for a request from another device.** **Open on desktop** is refused there, and a new terminal made there does not open one.

**Under an outside address, the access token never signs in.** Not the link `aubergine open` prints, not the cookie, not as a bearer. Only a device's own sign-in works there, and a device's sign-in works nowhere else. API tokens and terminals' own credentials work on `/v1` from there as they do at the computer.

## Getting a name

You need a name for [Way 3](#way-3-a-name-of-your-own-and-a-proxy). A private network ([Way 2](#way-2-a-private-network)) gives you one of its own, and an SSH tunnel ([Way 1](#way-1-an-ssh-tunnel)) needs none.

**A rented instance comes with an IP address and no usable name.** Some providers give an automatic name built from the IP address. It changes when the instance is stopped and started, and the usual certificate services will not give a certificate for it. Do not use it here.

To give an instance a name:

1. **Make its IP address permanent.** By default many providers give a new address each time the instance starts. Ask for a reserved or static IP address (the provider's own word may be "Elastic IP", "static external IP" or "reserved IP") and attach it to the instance.
2. **Point a name at it.** Where your name is managed, add an `A` record: the name (`aubergine.example.net`) and the IP address (`203.0.113.10`). It can take a few minutes to be seen everywhere.
3. **Open ports 80 and 443** in the instance's firewall (the provider may call it a security group or firewall rules). 443 is HTTPS. 80 is how most proxies prove the name to get a certificate. Do not open Aubergine's own port: it listens on `127.0.0.1` and would not answer anyway.

There are three ways to have a name:

- **A domain of your own.** Bought from any domain seller. You can make as many names under it as you like.
- **A private network's own name for the machine.** It comes with the private network, with a certificate, and only your own devices can open it. See [Way 2](#way-2-a-private-network).
- **A free dynamic-DNS name.** A service that gives out a name under its own domain, and points it at your IP address.

### Can I use the IP address alone?

Yes, in two ways, each with a catch.

- **An SSH tunnel.** You connect to the IP address with SSH, and use Aubergine as if you were at that machine. See [Way 1](#way-1-an-ssh-tunnel). The catch: it is awkward on a phone.
- **HTTPS on the IP address.** Aubergine accepts an IP address in `access.addresses`, like `"https://203.0.113.10"`. The catch is the certificate:
  - A **self-signed** certificate, one you make yourself, works, but every browser warns about it until you make a certificate authority of your own and install it on each device.
  - A **public certificate for an IP address** exists from some certificate services, but it lasts only days and must be renewed often. This project has not tried one.

## Way 1: an SSH tunnel

For: you alone, from your laptop, to Aubergine on a cloud instance you can already reach with SSH.

An SSH tunnel makes a port on your laptop lead to a port on the instance. Your browser opens `http://127.0.0.1:4600` on your laptop, and the request comes out at `127.0.0.1:4600` on the instance. Aubergine sees a request from its own computer, so nothing needs to be configured.

**The port must be the same at both ends.** Aubergine checks the name and port the browser asked for, and it must be its own (`127.0.0.1:<its port>` or `localhost:<its port>`). If your laptop runs its own Aubergine on 4600, run the instance's on another port, such as 4700, and use 4700 at both ends.

1. On your laptop, open the tunnel and keep this window open:

   ```sh
   ssh -L 4600:127.0.0.1:4600 you@203.0.113.10
   ```

   With another port, write it in both places: `ssh -L 4700:127.0.0.1:4700 you@203.0.113.10`.

2. On the instance, in that SSH window, start the server if it is not running:

   ```sh
   aubergine start
   ```

   For another port, start it with `AUBERGINE_PORT=4700 aubergine start`, and put `AUBERGINE_PORT=4700` before the command in the next step too.

3. On the instance, in a second SSH window, print the sign-in link:

   ```sh
   aubergine open --print
   ```

   It prints an address like `http://127.0.0.1:4600/auth?token=…`. The server also prints it when it starts.

4. Open that link in the browser on your laptop, once. The browser is then signed in.

What to know:

- **The link contains the access token.** Whoever has it is you, with a shell on the instance. Do not share it, paste it into a chat, or save it anywhere.
- It signs in with the access token, not as a device, so there is nothing to revoke for each browser. Closing the tunnel is what closes the way in.
- The page treats you as at that machine: **Open on desktop** is offered, and acts on the instance's desktop, which usually does not exist.
- `aubergine start` runs in the foreground. When the SSH window that started it closes, the server stops; the terminals keep running and come back when you start it again. Start at login exists for macOS only.
- It is awkward on a phone, which needs an SSH app that can make tunnels.

## Way 2: a private network

For: you alone, from any of your own devices, phone included, to Aubergine on your laptop or on a cloud instance.

A private network joins your own devices to each other over the internet, as if they were on one network at home. Some of these products (Tailscale is one) can also serve HTTPS under a name of their own for one machine, with a certificate, and pass it on to a port of that machine. Only devices in your private network can open that name.

1. Install the private network on the machine where Aubergine runs, and on each device you will use it from (your phone, another computer). Sign in to the same network on all of them.
2. On the machine where Aubergine runs, turn on the private network's HTTPS serving and point it at `127.0.0.1:4600` (or the port you chose). How you do that is in that product's own documentation. It gives you a name, something like `laptop.your-network.ts.net`.
3. Write that name, with `https://` in front, in `config.json` (see [Telling Aubergine its name](#step-2-telling-aubergine-its-name)) and start the server again.
4. [Pair each browser](#pairing-a-browser).

**Never use such a product's mode that publishes a machine to the whole internet** (Tailscale calls it Funnel). That puts Aubergine's sign-in in front of everyone.

The private network's serving must pass the `Host` header through unchanged; see the next part for why.

## Way 3: a name of your own and a proxy

For: a browser on any device, with nothing installed on it, reaching Aubergine on a cloud instance under a name of your own.

This is the worked example from nothing. It assumes a Linux instance that you can reach with SSH, with Aubergine installed. Linux has been run only in the container in [`docker/`](../docker), on a Mac, and not on a cloud instance; see [What to count on, and what not](#what-to-count-on-and-what-not).

**Read this first: an address anyone on the internet can open puts the sign-in in front of everyone.** Without a code nobody gets in, and codes are hard to guess, but they would be guessing at a shell. Put a private network, or your organisation's own sign-in, in front of the address if you can.

### Step 1: a name and open ports

Follow [Getting a name](#getting-a-name): a permanent IP address, an `A` record for `aubergine.example.net` pointing at it, and ports 80 and 443 open.

### Step 2: telling Aubergine its name

The settings file is `config.json` in the data folder. The data folder is:

| System | Data folder |
|---|---|
| macOS | `~/Library/Application Support/Aubergine` |
| Linux | `~/.local/share/aubergine` (or `$XDG_DATA_HOME/aubergine` where that is set) |
| Any, when `AUBERGINE_DATA_DIR` is set | that folder |

`aubergine doctor` prints it on its `data folder:` line, and the server prints it when it starts.

1. If `config.json` is not there, create it. Write the address in it:

   ```json
   { "access": { "addresses": ["https://aubergine.example.net"] } }
   ```

   If the file already has other settings, add `"access"` beside them, inside the same outer `{ }`.

   The rules for an entry: `https` only; the origin alone, with no path, no `?` or `#`, and no user name or password; not `127.0.0.1`, `localhost` or `[::1]`. If the proxy listens on a port other than 443, write the port: `https://aubergine.example.net:8443`.

2. Start the server again. The addresses are read when it starts, and no page or program can change them.

3. Check:

   ```sh
   aubergine doctor
   ```

   Its `outside addresses:` line lists the addresses the server will answer under, and a line for each entry that is wrong and why. A wrong entry is also reported when the server starts, and skipped.

### Step 3: the proxy

The proxy has two requirements:

- **It runs on the same machine as Aubergine** and passes requests to `http://127.0.0.1:4600` (or your port).
- **It passes the `Host` header through unchanged.** The `Host` header is the name the browser asked for. Aubergine tells where a request came in from that header alone, and believes no forwarded header. A proxy that writes `127.0.0.1:4600` in its place gets "Host not allowed".

It must also pass WebSocket connections on: the terminals use them.

Caddy is one web server that gets a certificate for the name by itself and does both. Its whole configuration file (`Caddyfile`) for this is:

```
aubergine.example.net {
	reverse_proxy 127.0.0.1:4600
}
```

Caddy passes `Host` through unchanged and passes WebSockets on without being told.

A proxy that rewrites `Host` by default needs one line to stop that. In nginx, inside the `location` that passes requests on, it is:

```
proxy_set_header Host $host;
```

nginx also needs these three lines in the same place for WebSockets, and a certificate you get for it yourself:

```
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Step 4: pairing

Open `https://aubergine.example.net` on the other device. It shows "This browser is not signed in yet" and a field for a code. Make a code as described in the next part.

## Pairing a browser

Pairing turns one browser into a device. You make a code where you are already signed in, and type it, or scan it, on the new browser.

**Make a code**, either way:

- At the computer, or in a terminal on the machine Aubergine runs on:

  ```sh
  aubergine device add --name "Phone"
  ```

  It prints the code, and for each address in `access.addresses` a link with the code in it and a QR code of that link.

- Or in a browser that is already signed in: **Settings → Devices → Add a device** (or **Devices…** in the palette). It asks for a name, then shows the code, how long it still works, and for each address its QR code and the link.

**Use it on the new device:**

- Scan the QR code or open the link. The page takes the code out of the address before it asks the server anything, and signs that browser in.
- Or open the address itself. A browser that is not signed in sees "This browser is not signed in yet" and one field. Type the code there, with or without the dash, in either case, and press **Sign in**.

About codes:

- A code works once, for three minutes. It is kept only in the server's memory; the page never stores it.
- At most three wait at a time; a fourth withdraws the oldest.
- A code is taken only under an outside address. Typed into a browser at the computer itself, at `127.0.0.1`, it is not taken (and stays usable). There, sign in with `aubergine open --print` instead.
- Five wrong codes withdraw every code that waits. More than ten tries in a minute, right or wrong, are refused with "Too many tries at a code in a minute." Make a new code then.
- Every try is recorded in the activity log, never the code.

**See and revoke devices:**

```sh
aubergine device list
```

It shows each device's name, kind, state, when it was added and last used, and its ID.

```sh
aubergine device revoke "Phone"
```

It asks first, unless you add `--yes`. In the page, the same list is under **Settings → Devices**, with **Revoke…** on each, which asks first.

- Revoking signs the device out at once, and what it has open loses its connection.
- A device can be revoked from another device, or from itself.
- A device that is not used for 90 days stops working.
- **A device is the whole owner**: whoever has it has a shell on that machine as you.

## Two servers in one page

The page of one Aubergine (on your laptop, say) can also show the projects of another (on a cloud instance, or a second server on the same computer). The other one is a **linked server**.

**Before you start:** the other server must already be reachable from your browser over HTTPS (by [Way 2](#way-2-a-private-network) or [Way 3](#way-3-a-name-of-your-own-and-a-proxy)), or be on the same computer.

### On the other server

1. **Find your page's origin.** Look at the address bar of the page you will link from, and keep only the scheme, name and port. If it shows `http://127.0.0.1:4600/c/0190…`, the origin is `http://127.0.0.1:4600`. `localhost` and `127.0.0.1` are different origins: use the one you open. The **Link a server…** dialog also shows it.
2. Write that origin under `access.pages` in the other server's `config.json`, and start the other server again:

   ```json
   { "access": { "pages": ["http://127.0.0.1:4600"] } }
   ```

   A page's origin is `https`, or plain `http` only on `127.0.0.1` or `localhost`. The other server's `aubergine doctor` lists it on its `linked pages:` line.

3. On the other server, make a code for that page:

   ```sh
   aubergine device add --page http://127.0.0.1:4600 --name "Laptop"
   ```

   It prints a code. It works once, for three minutes.

### In your page

4. Open the project menu and choose **Link a server…** at its foot (it is also in the palette).
5. Fill in the address of the other Aubergine (as you would open it, like `https://aubergine.example.net`), a name for it here, and the code. Press **Link**.

The browser sends the code to that server itself and is answered with a credential. The other server is shown at once.

### Afterwards

- The project menu lists the projects of the server shown first, then this page's own server and each linked server under its name and host, with their projects. Choosing one shows that server.
- **One server is shown at a time.** Everything on it, from the canvases and terminals to the queue, the runs, the tokens and the devices, is that server's.
- Its canvases have addresses of their own in this page, `/s/<link>/p/<project>/c/<canvas>`. A reload, the back button and a terminal opened in a browser tab of its own stay on that server.
- The page is a device on the other server: its `aubergine device list` shows it as `page` with its origin.
- What stays this page's own: how the page looks (light or dark, the color theme of each, colors set by hand, and the terminals' font and cursor) and the keys are this page's own server's settings whatever is shown. What this browser remembers (the side panel, the bar, the tour) is this browser's. Settings says which server everything else in it is about.
- No canvas holds terminals of both servers, and a canvas does not move between servers. What waits for you is counted for the server shown only. Both servers must run the same version of Aubergine.
- This page's own server is never told that a linked server exists, and never calls one: the browser does.
- On the other server, the credential works only from this page's origin, only as the page sends it itself. No cookie is taken from another page, and API tokens and terminals' credentials are refused from it.

**Unlink…**, in that server's part of the project menu (or **Unlink the server shown…** in the palette), asks first, then forgets the server in this browser and asks it to revoke this page's device. If it cannot be told, the page says so: revoke it there under Settings → Devices or with `aubergine device revoke`.

**The credential is kept in this browser's storage, for this page's address. Whoever is the owner on this computer is the owner on every server linked from it.**

## In a container

**Run once, on one computer.** On 2026-11-22 these steps were followed as written on an Apple-silicon Mac, with Docker in Colima (linux/arm64), under `https://aubergine.localhost` with the web server's own certificate, and a browser (Chromium) went the whole way: paired with a code, made terminals, typed into them, saw command status from the zsh integration, and was signed out when its device was revoked. Three things were fixed on that run: the build without BuildKit, a revoked page that kept trying to reconnect, and command status for a server started without `$SHELL`. **Not tried:** a real name with a public certificate, a cloud machine, these steps on linux/amd64 (the image was only built and tried there, see [the published image](#the-published-image)), Docker with BuildKit (Compose there used the classic builder), a phone, and an agent inside the container. When something fails, send back the output of `docker compose logs aubergine` and of `docker compose exec aubergine aubergine doctor`.

The files are in [`docker/`](../docker) in the repository.

**What you get:** two containers that share one network. One runs the server, its terminals and the `aubergine` command. The other runs a web server (Caddy) that accepts HTTPS under your name and passes each request on to the server at `127.0.0.1`. Your work and Aubergine's data are in one volume: the home folder of the user the terminals run as.

The two share a network because the server listens on `127.0.0.1` only, inside its container, and that does not change. A port published from its own container would reach nothing. Only the web server's ports 80 and 443 are published. Never publish Aubergine's own port.

**What you need:**

- Docker, with Compose.
- A copy of this repository on the machine: the Compose file and the web server's settings are in `docker/`, and the image is built from it, by the same script that builds the npm package, unless you use [the published image](#the-published-image).
- A name that points at the machine, with ports 80 and 443 reaching it. See [Getting a name](#getting-a-name). To try it on your own computer first, you need no name: see [Trying it on your own computer first](#trying-it-on-your-own-computer-first).

### The published image

A pushed release tag also publishes the image to GitHub's container registry, as `ghcr.io/thirstyeggplant/aubergine`, tagged with the version (`0.3.0`, say) and `latest`; each platform also has a tag of its own (`0.3.0-amd64`, `0.3.0-arm64`). It is one name for two platforms, linux/amd64 and linux/arm64; Docker takes the one for its machine. The workflow `.github/workflows/publish-image.yml` builds it from the tag with the same `docker/Dockerfile`, each platform on a machine of its own kind, and starts and tries each (the command answers, the terminal library runs a program, the server starts and makes a terminal) before anything is pushed: if either fails, neither is pushed.

```sh
docker pull ghcr.io/thirstyeggplant/aubergine:latest
```

**The image alone is not enough.** The server in it listens on `127.0.0.1` inside its container, so it needs the web server for HTTPS beside it on its network, and a browser still has to be paired. Use it through `docker/compose.yaml`, as in the steps below: `docker compose pull` fetches it, and `AUBERGINE_TAG` in `.env` picks a version (`latest` when it is not set).

**What has been tried, and what not.** Releases up to 0.2.0 were made before this workflow, so no image is published for them; the first is published with the next release. A new package on the registry starts private, and its owner sets it to public once, by hand; until then a pull is refused, and `docker compose up` builds from the checkout instead. The workflow's trial run, which builds and tries both platforms and pushes nothing, passed on 2026-11-22 ([the run](https://github.com/thirstyeggplant/aubergine/actions/runs/45084508734)): on GitHub's linux/amd64 and linux/arm64 runners the image built, `aubergine version` answered, node-pty ran a program, the server started, made a terminal and listed it, and `aubergine doctor` found everything in place. That is all that has been run on linux/amd64: not the steps below, a web server in front or a browser. Not tried: pushing to the registry, pulling the published image, and running it under Compose. Everything in the steps below was run with an image built from the checkout on linux/arm64.

**How Compose treats the two.** The service has both `image` (the published name) and `build` (this checkout). With no `pull_policy` set, Compose does this:

- `docker compose up -d` uses the image of that name already on the machine. When there is none, it pulls it, and when the pull fails it builds from the checkout.
- `docker compose up -d --build` builds from the checkout either way, and gives the result the published name. When no image of that name is on the machine yet, it first tries to pull one, then builds anyway; `docker compose build` and then `docker compose up -d` skips that pull.
- `docker compose pull` fetches the published image and puts it under that name, in place of one built here.

So the name holds whichever came last, a build or a pull. Choose one way and keep to it.

### The steps

1. Go to the folder with the files:

   ```sh
   cd docker
   ```

2. Copy the example settings, and write your name in `.env` in place of `aubergine.example.net`, without `https://`:

   ```sh
   cp .env.example .env
   ```

3. Build the image and start both containers:

   ```sh
   docker compose up -d --build
   ```

   Or, with [the published image](#the-published-image) in place of a build, fetch it and start both:

   ```sh
   docker compose pull
   ```

   ```sh
   docker compose up -d
   ```

   The first build takes a few minutes (about five on that Mac); the image is about 680 MB. Built without BuildKit, each build also leaves the build stage behind as an untagged image (listed at about 2.6 GB, most of it shared with the `node` image it starts from): `docker image ls --filter dangling=true` lists such images, and `docker image rm <ID>` removes one.

   On its first start, the container writes `https://` and your name into `config.json` in the data folder, as `access.addresses`. It does that only when there is no `config.json` yet. Later, the file is yours to change by hand, and the container never changes it again; if the name in `.env` changes, it says in its log what to add.

4. Check what the server sees:

   ```sh
   docker compose exec aubergine aubergine doctor
   ```

   Its `outside addresses:` line should show your name with `https://` in front.

5. Make a pairing code:

   ```sh
   docker compose exec aubergine aubergine device add --name "My laptop"
   ```

   It prints a code, a link with the code in it and a QR code of that link. Open the link, or open `https://` and your name and type the code. See [Pairing a browser](#pairing-a-browser): everything there holds here.

6. Follow what the server says:

   ```sh
   docker compose logs -f aubergine
   ```

   Its first lines name a sign-in link at `http://127.0.0.1:4600`, as `aubergine start` does anywhere. It is of no use from outside the container, and it holds the access token: do not paste the log where others read it. Sign in with a code as in step 5.

7. To update, get the new code and build again:

   ```sh
   git pull
   ```

   ```sh
   docker compose up -d --build
   ```

   With the published image, change `AUBERGINE_TAG` in `.env` if you named a version, then fetch it and start again:

   ```sh
   docker compose pull
   ```

   ```sh
   docker compose up -d
   ```

   Either makes a new container, so the terminals end and come back as fresh shells (see below). `aubergine update` inside the container is not the way: it names an npm command, and the image is built from this checkout or pulled.

8. To stop both containers:

   ```sh
   docker compose down
   ```

   The volumes stay, and `docker compose up -d` starts again where you were.

**Removing everything, which deletes your work.** This removes the volumes as well: the home folder with your clones and anything you installed, Aubergine's data with its state and paired devices, and the web server's certificates. It cannot be undone.

```sh
docker compose down --volumes
```

### Trying it on your own computer first

Write `AUBERGINE_HOST=aubergine.localhost` in `.env`, start it as in step 3, and open `https://aubergine.localhost` in a browser on the same computer. Aubergine takes `https://aubergine.localhost` as an outside address: only `127.0.0.1`, `localhost` and `[::1]` themselves are refused.

The browser warns about the certificate: for a name ending in `.localhost`, the web server makes a certificate itself, and no browser trusts it. Some browsers find a name ending in `.localhost` on this computer by themselves; if yours does not, it cannot open the address.

Ports 80 and 443 on your computer must be free for this. With Colima on a Mac they were published as they are, with nothing else to set. Chromium and `curl` found `aubergine.localhost` by themselves.

### What lives where

| What | Where | Kept when |
|---|---|---|
| The image: Node.js, tmux, zsh, git and Aubergine | Built from this checkout, or pulled from the registry | Replaced at each `--build` or `pull` |
| Your home folder: your clones, the agents you install, their sign-ins | The volume `aubergine-home`, at `/home/aubergine` | Until you remove the volumes |
| Aubergine's data folder: the state, the access token, the paired devices, `config.json` | Inside that volume, at `/home/aubergine/.local/share/aubergine` | The same |
| The web server's certificates | The volumes `caddy-data` and `caddy-config` | The same |

### Agents and tools

None are in the image. Install the one you use as the `aubergine` user, inside the container:

```sh
docker compose exec aubergine npm install -g <the agent's npm package>
```

It goes into the home volume (`~/.npm-global`), so it is kept when the image is built again. Or build an image of your own that starts `FROM` this one.

Signing an agent in, and giving Git its credentials (an SSH key, a credential helper), are done inside the container, in a terminal on the canvas or with `docker compose exec aubergine zsh`. They are kept in the home volume.

### What is different from a laptop

- **The terminals end when the container stops** or is made again, at an update. Restarting the web server's container does not end them: the network the two share is the `aubergine` container's. If Docker itself restarts the `aubergine` container after a failure, restart the web server too (`docker compose restart proxy`), since it had joined the network that is gone: until then the page cannot be reached at all. `docker compose restart aubergine` and `docker compose up -d` restart the web server by themselves. When the server starts again, every terminal gets a fresh shell in its last known folder, in the same place on the canvas. Nothing is re-run. This is what a laptop does after a reboot.
- **Nothing opens on a desktop.** There is none: **Open on desktop** is left out under an outside address anyway.
- **Start at login does not apply.** The containers' restart policy (`unless-stopped`) starts them again with Docker.
- **The terminals run zsh.** Command status in a terminal's title comes from the zsh integration; another shell would work but show none.

### What to know before putting it on the internet

- **Ports 80 and 443 are open to whoever can reach the machine,** so the field for a pairing code is in front of them. Limit who can reach those ports with the provider's firewall, or put a private network in front.
- **A device is the whole owner,** here as anywhere: it has a shell in the container, with everything in the home volume.
- A container keeps the terminals' files apart from the machine's own files. This guide makes no promise beyond that.
- **Never mount the Docker socket or the machine's home folder into the container.** Either would hand the terminals the machine itself.

## When it does not work

| What you see | Why | What to do |
|---|---|---|
| "Host not allowed" | The name you opened is not in `access.addresses`; or the server was not started again after you wrote it; or the proxy changed the `Host` header; or, through an SSH tunnel, the port on your laptop differs from the server's | Check `aubergine doctor`'s `outside addresses:` line. Start the server again. Make the proxy pass `Host` unchanged. Use the same port at both ends of a tunnel. |
| "Origin not allowed" | The page was opened under one address and is talking to the server under another, for example `http` in place of `https`, or another port | Open the page at exactly the address written in `access.addresses` |
| "This browser is not signed in yet" keeps coming back | The browser is not paired, its device was revoked or went unused for 90 days, or the browser does not keep cookies for the address | Pair it again. In a private window the sign-in lasts only as long as the window. |
| "That code did not work." | The code was used already, is older than three minutes, five wrong tries withdrew every waiting code, a fourth code withdrew it, or it was typed into a browser at the computer itself | Make a new code and use it at once, on the other device, under the outside address |
| "No outside address is written in the settings, so a code could not be used anywhere." | `aubergine device add` or **Add a device** was used before any address was written, or before the server was started again | Write the address in `access.addresses` and start the server again |
| "Too many tries at a code in a minute." | More than ten tries in a minute, from anywhere | Wait the seconds it says, then make a new code |
| The browser warns about the certificate | The proxy has no certificate for the name yet, the name does not point at the instance yet, port 80 is closed so no certificate could be got, or the certificate is self-signed | Check the `A` record and the open ports, and the proxy's own log. A self-signed certificate warns until your own certificate authority is installed on the device. |
| **Link a server…** says "No answer came." | The other server does not list this page's origin under `access.pages`, was not started again after it was written, or is not reachable at that address | Check the origin is exactly the one in this page's address bar, start the other server again, and open the other server's address in a browser tab to see that it answers |
| "That origin is not written in access.pages in config.json…" | `aubergine device add --page` was given an origin that is not in the other server's `access.pages`, or the server was not started again | Write it there exactly, start the server again, and make the code then |
| A linked server "no longer takes this page's sign-in" | Its device for this page was revoked there, or went unused for 90 days | Link it again, or unlink it, from the project menu |
| "runs another version of Aubergine" | The two servers run different versions | Update both (`npm install -g @meatgarden/aubergine@latest`, or `aubergine update` for a copy from the installer) and start them again |
| The phone loses the page when the laptop sleeps | A sleeping laptop answers nothing | Keep the laptop awake, or run the server on a cloud instance |

## What to count on, and what not

- **A stranger who finds the address** gets the page's files and a field for a code. Nothing else answers without a sign-in, and codes are hard to guess.
- **An address anyone can open puts that field in front of everyone.** They would be guessing at a shell. A private network, or your organisation's own sign-in, in front of the address is recommended.
- **A device, and a linked page, is the whole owner.** Pair and link only what you would hand your keyboard to.
- **The page is not laid out for a phone.** It works as it does in a narrow window.
- **Tried once:** the container setup in `docker/`, on one Mac (Colima, linux/arm64), with Caddy in front under `aubergine.localhost`, and a browser on the same Mac. **Not tried:** a real name with a public certificate, a cloud machine, Linux outside that container, linux/amd64 beyond building and trying the image on a GitHub runner, a real phone, and two separate machines. The rest of what this guide says comes from the code and its tests, not from a setup someone has run.
