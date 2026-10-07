# RideFlow Instance Manager

Web tool for running one RideFlow deployment per company — on this server or on
remote servers — from a browser.

- **Instances**: create (copy config / full copy / fresh), start, stop, restart,
  update to a release, logs, backups, delete. Filter by state, server, environment
  or free text (company, contact, domain, tags).
- **Releases**: *Build latest code* runs `git pull` in the source checkout and builds
  `rideflow/<backend|client|staff|website>:<git-sha>` once. Update instances one by
  one or roll out to all of them (each is backed up first).
- **Servers**: add a remote server with IP + root password. The manager installs its
  own SSH key (password is not stored), Docker and Caddy, then deploys there by
  streaming the release images over SSH.

## Layout

```
/opt/rideflow/instances/<slug>/compose.yml     # = instance-compose.yml
/opt/rideflow/instances/<slug>/.env            # ports, release tag, secrets, keys
/opt/rideflow/instances/<slug>/firebase-service-account.json
/etc/caddy/sites/<slug>.caddy                  # imported by /etc/caddy/Caddyfile
/opt/rideflow/manager-data/                    # manager.db, ssh key, backups/
/etc/rideflow-manager.env                      # login + settings (chmod 600)
```

Each instance is a Compose project `rideflow-<slug>` with its own Postgres volume.
The original GoBellMe deployment keeps its project name `rideflow` (so its data
volume `rideflow_postgres_data` is unchanged) and its Caddy blocks stay in the main
Caddyfile.

> Don't run `docker compose -f docker-compose.prod.yml up` in `/root/RideFlow`
> any more — it would fight the managed `rideflow` project. Deploy through the
> manager (Releases → Build, then Update).

## Install / upgrade

```bash
cd /root/RideFlow && git pull
bash ops/instance-manager/install.sh   # prints the admin password on first install
```

Manual operations on an instance:

```bash
cd /opt/rideflow/instances/<slug>
docker compose -p rideflow-<slug> -f compose.yml --env-file .env ps|logs -f backend|restart
```
