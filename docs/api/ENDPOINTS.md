# Liara API endpoint inventory

Source: https://github.com/liara-cloud/openapi — retrieved 2026-10-22. Documented, not live-tested.

## dbaas.yaml

| Method | Path | Summary |
|---|---|---|
| GET | /v1/databases/{id} | Get a database |
| DELETE | /v1/databases/{id} | Delete a database |
| GET | /v1/databases | Get all databases |
| POST | /v1/databases | Create a database |
| POST | /v1/databases/{id}/actions/scale | Power on or power off a database |
| POST | /v1/databases/{id}/resize | Resize a database |
| GET | /v1/databases/{id}/backups | Get all backups |
| POST | /v1/databases/{id}/backups | Backup a database |
| PATCH | /v1/databases/{id}/settings | Settings a database |
| POST | /v1/databases/{id}/backups/{name}/download | Download a backup |
| POST | /v1/databases/{id}/control-panel/{status} | Change control-panel status |
| PATCH | /v1/databases/{id}/public-network/{status} | Change public network status |
| GET | /v1/databases/{id}/metrics/cpu | Get cpu reports of database |
| GET | /v1/databases/{id}/metrics/memory | Get memory reports of database |
| GET | /v1/databases/{id}/metrics/network-receive | Get network-receive reports of database |
| GET | /v1/databases/{id}/metrics/network-transmit | Get network-transmit reports of database |
| GET | /v1/databases/{id}/metrics/summary | Get summary reports of database |
| GET | /v1/databases/{name}/events | Get events of the database |

## dns.yaml

| Method | Path | Summary |
|---|---|---|
| GET | /api/v1/zones | List all zones |
| POST | /api/v1/zones | Create Zone |
| GET | /api/v1/zones/{zone} | Get Zone |
| DELETE | /api/v1/zones/{zone} | Delete Zone |
| PUT | /api/v1/zones/{zone}/check | check nameserver |
| GET | /api/v1/zones/{zone}/dns-records | Get all dns record |
| POST | /api/v1/zones/{zone}/dns-records | Create dns record |
| GET | /api/v1/zones/{zone}/dns-records/{id} | Get dns record |
| PUT | /api/v1/zones/{zone}/dns-records/{id} | edit dns record |
| DELETE | /api/v1/zones/{zone}/dns-records/{id} | delete dns record |

## paas.yaml

| Method | Path | Summary |
|---|---|---|
| GET | /v1/projects | Get details of all projects |
| POST | /v1/projects | Create a app |
| GET | /v1/projects/{name} | Get details of a project |
| DELETE | /v1/projects/{name} | Delete a app |
| POST | /v1/projects/{name}/actions/scale | Turn on or off a app |
| POST | /v1/projects/{name}/actions/restart | To restart a app |
| POST | /v2/projects/{name}/sources | Deploy sources code |
| POST | /v2/projects/{name}/releases | Deploy releases |
| POST | /v1/projects/{id}/zero-downtime/{status} | Zero downtime |
| POST | /v1/projects/{id}/default-subdomain/{status} | Default subdomain |
| POST | /v1/projects/{id}/fixed-ip/{status} | IP static |
| POST | /v1/projects/{id}/read-only/{status} | Read only |
| POST | /v1/projects/update-envs | Update envs |
| POST | /v1/projects/{name}/resize | Change plan |
| POST | /v1/projects/{name}/disks/{dname}/ftp | Create ftp |
| GET | /v1/projects/{name}/disks/{dname}/ftp | Get ftps |
| GET | /v1/projects/{id}/disks | Get disks |
| GET | /v1/projects/{id}/disks/{name}/backups | Get backups disk |
| POST | /v1/projects/{id}/disks/{name}/backups | Create backup disk |
| POST | /v1/projects/{id}/disks/{dname}/backups/{bname}/download | Download backup disk |
| POST | /v1/projects/{name}/disks/{dname}/resize | Resize disk |
| POST | /v1/projects/{name}/disks | Create a disk |
| DELETE | /v1/projects/{id}/disks/{name} | Delete a disk |
| DELETE | /v1/ftp/{fname} | Delete a ftp |
| GET | /v1/domains/{id}/check | Check a domain |
| GET | /v1/projects/{name}/logs | Get logs of app |
| GET | /v1/projects/{name}/events | Get events of the app |
| GET | /v1/projects/{name}/applets | Get applets of app |
| GET | /v1/projects/{name}/releases | Get releases of app |
| GET | /v1/projects/{name}/metrics/summary | Get summary reports of app |
| GET | /v1/projects/{name}/metrics/cpu | Get cpu reports of app |
| GET | /v1/projects/{name}/metrics/memory | Get memory reports of app |
| GET | /v1/projects/{name}/metrics/network-receive | Get network-receive reports of app |
| GET | /v1/projects/{name}/metrics/network-transmit | Get network-transmit reports of app |
| GET | /v1/domains | Get all domains |
| POST | /v1/domains | Create a domain |
| POST | /v1/domains/set-project | Set a domain for project |
| POST | /v1/domains/{id}/set-redirect | Redirect a domain |
| POST | /v1/domains/{id}/ssl/disable | Disable ssl |
| POST | /v1/domains/provision-ssl-certs | Enable ssl |
| DELETE | /v1/domains/{id} | Delete a domain |

