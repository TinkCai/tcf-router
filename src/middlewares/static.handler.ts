import { TcfApiHandler, TcfApiRequest } from '../index';
import { Response, resourceNotFound } from '../response';

const path = require('path');
const fs = require('fs');

const handler = (staticBasePath: string): TcfApiHandler => {
  return ((req: TcfApiRequest, res: Response, next: () => void) => {
    if (req.httpMethod === 'GET' || req.httpMethod === 'HEAD') {
      if (req.path.indexOf('..') > -1) {
        res.end(resourceNotFound(req.path));
        return;
      }
      const filePath = path.join(staticBasePath, req.path);
      if (fs.existsSync(filePath)) {
        const fileState = fs.statSync(filePath);
        if (fileState.isFile()) {
          res.file(filePath);
        } else {
          next();
        }
      } else {
        next();
      }
    } else {
      next();
    }
  }) as TcfApiHandler;
};

export default handler;
