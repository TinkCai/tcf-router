import { TcfApiHandler, TcfApiRequest } from '../index';
import { Response, resourceNotFound } from '../response';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Static file serving middleware
 * Serves static files from specified base directory
 * @param staticBasePath - Base directory path for static files
 * @returns TCF API handler function
 */
const handler = (staticBasePath: string): TcfApiHandler => {
  return ((req: TcfApiRequest, res: Response, next: () => void) => {
    if (req.httpMethod !== 'GET' && req.httpMethod !== 'HEAD') {
      next();
      return;
    }

    const requestPath = decodeURIComponent(req.path);

    if (requestPath.includes('..') || path.isAbsolute(requestPath)) {
      res.end(resourceNotFound(req.path));
      return;
    }

    const filePath = path.join(staticBasePath, requestPath);

    if (!fs.existsSync(filePath)) {
      next();
      return;
    }

    try {
      const fileStats = fs.statSync(filePath);

      if (fileStats.isFile()) {
        res.file(filePath);
      } else {
        next();
      }
    } catch (error) {
      next();
    }
  }) as TcfApiHandler;
};

export default handler;
