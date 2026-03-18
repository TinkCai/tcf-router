import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';

/**
 * HTTPS redirect middleware
 * Redirects HTTP requests to HTTPS using domain from environment variables
 * Requires DOMAIN environment variable to be set
 */
const protocolMiddleware: TcfApiHandler = async (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void
) => {
  const clientProtocol = req.headers['x-client-proto'];

  if (clientProtocol === 'http') {
    const domain = process.env.DOMAIN;

    if (!domain) {
      console.warn(
        'DOMAIN environment variable is not set, skipping HTTPS redirect'
      );
      next();
      return;
    }

    const queryParams = req.queryStringParameters;
    const queryString = queryParams
      ? new URLSearchParams(
          Object.entries(queryParams) as [string, string][]
        ).toString()
      : '';

    const redirectUrl = `https://${domain}${req.path}${queryString ? '?' : ''}${queryString}`;

    res.redirect(redirectUrl);
    return;
  }

  next();
};

export default protocolMiddleware;
