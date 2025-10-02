## Control de eventos ISTE

Aplicación interna para el control de ingreso a eventos mediante códigos QR y paneles de seguimiento.

## Requisitos de autenticación (Entra ID)

- Configura la aplicación registrada en Entra ID con los siguientes grupos de seguridad:
  - `app-eventos-admins` (`e10a3003-546f-4cd3-8236-d6c46b96c3f2`)
  - `app-eventos-financiero` (`31474537-b620-4b3d-b47e-92df19199e08`)
  - `app-eventos-guardia` (`9f5205f6-8328-4393-a6f5-95fd3330315f`)
- Asegúrate de que el manifiesto de la app incluya el claim `groups` en el token ID.
- Variables de entorno obligatorias:

```bash
CLIENT_ID="<Application (client) ID>"
CLIENT_SECRET="<Client secret value>"
TENANT_ID="<Directory (tenant) ID>"
AUTH_SECRET="<cadena aleatoria segura>"
NEXTAUTH_URL="https://eventos.iste.edu.ec"
```

El `AUTH_SECRET` se usa para firmar los tokens de NextAuth y debe ser una cadena aleatoria segura (puedes generarla con `openssl rand -base64 32`).

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación estará disponible en [http://localhost:3002](http://localhost:3002).
