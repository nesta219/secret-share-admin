import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

const TEST_USERNAME = 'integration-test@send-a-secret.link';
const TEST_PASSWORD = 'IntegrationTest-2026!Long';

export interface AuthContext {
  apiBase: string;
  idToken: string;
}

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

const ensureUser = async (userPoolId: string): Promise<void> => {
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: TEST_USERNAME,
        UserAttributes: [
          { Name: 'email', Value: TEST_USERNAME },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      }),
    );
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
  }
  // Permanent password so admin-initiate-auth returns tokens directly (no
  // NEW_PASSWORD_REQUIRED challenge dance).
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: TEST_USERNAME,
      Password: TEST_PASSWORD,
      Permanent: true,
    }),
  );
};

// Mints an ID token for the integration test user. Env vars come from the
// Makefile target (`make test-integration ENV=dev`), which pulls them from
// terragrunt outputs.
export const getAuthContext = async (): Promise<AuthContext> => {
  const userPoolId = required('COGNITO_USER_POOL_ID');
  const clientId = required('COGNITO_CLIENT_ID');
  const apiBase = required('ADMIN_API_BASE');

  await ensureUser(userPoolId);

  const res = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: TEST_USERNAME,
        PASSWORD: TEST_PASSWORD,
      },
    }),
  );

  const idToken = res.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error(`auth returned no IdToken; got challenge=${res.ChallengeName ?? 'none'}`);

  return { apiBase, idToken };
};

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`integration test env var ${name} is required`);
  return v;
};
