# TCC

## Autor: Marcos Rezende

## Curso: Engenharia de Sistemas

## UFMG - 2025

### Inicializar infra

#### Cenário 1 – PostgreSQL

```sh
docker compose --profile s1 up -d
```

#### Cenário 2 – MongoDB

```sh
docker compose --profile s2 up -d
```

#### Cenário 3 – PostgreSQL + Redis

```sh
docker compose --profile s3 up -d
```

#### Cenário 4 – MongoDB + Redis

```sh
docker compose --profile s4 up -d
```

#### Cenário 5 – PostgreSQL + MongoDB

```sh
docker compose --profile s5 up -d
```

#### Cenário 6 – PostgreSQL + MongoDB + Redis

```sh
docker compose --profile s6 up -d
```

### Acessos infra

- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- cAdvisor: http://localhost:8080
- Postgres: localhost:5432 (tcc/tcc, db appdb)
- Mongo: localhost:27017 (tcc/tcc)
- Redis: localhost:6379

### Executar testes no k6

#### 100 VUs por 3 minutos contra o gateway

```bash
docker compose run --rm --profile -e VUS=100 -e DURATION=3m k6 run script.js
```

### Executar a aplicação

```bash
SCENARIO=s1 docker compose --profile s1 up -d
```
