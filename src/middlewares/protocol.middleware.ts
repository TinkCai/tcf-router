import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';

const protocolMiddleware = (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void
) => {
  if (req.headers['x-client-proto'] === 'http') {
    const params = new URLSearchParams();
    for (let key in req.queryStringParameters) {
      params.append(key, req.queryStringParameters[key] as string);
    }
    const query = params.toString();
    const redirectUrl = `https://${process.env.DOMAIN}${req.path}${
      query ? '?' : ''
    }${query}`;
    res.redirect(redirectUrl);
  } else {
    if (next) {
      next();
    }
  }
};

export default protocolMiddleware as TcfApiHandler;
