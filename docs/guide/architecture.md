# Architecture & Pipeline

AeroJS utilizes a high-performance **Onion Middleware Pipeline** coupled with a robust **IoC Container**.

```mermaid
graph TD
    Request --> Middleware1
    Middleware1 --> Middleware2
    Middleware2 --> Controller
    Controller --> Middleware2_Post
    Middleware2_Post --> Middleware1_Post
    Middleware1_Post --> Response
```
