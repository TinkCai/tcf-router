import { AddRoutes, TcfApiRequest, TcfApiResponse, Router } from 'tcf-router';

const route = async (sr: Router) => {
  sr.get('/test', async (req: TcfApiRequest, res: TcfApiResponse) => {
    return res.text('123');
  });
};

export default route as AddRoutes;
