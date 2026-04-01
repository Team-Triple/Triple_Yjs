export class YWebSocketHandler {
  constructor({ utils }) {
    this.utils = utils;
  }

  handleConnection(ws, req, session) {
    ws.session = session;
    this.utils.setupWSConnection(ws, req, { docName: session.travelDocId });
  }
}
