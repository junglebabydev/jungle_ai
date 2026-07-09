import { HTTPS_STATUS_CODE } from "../shared/enums";

class ApplicationError extends Error {
  status: string;
  statusCode: HTTPS_STATUS_CODE;

  constructor(status: string, message: string, statusCode: HTTPS_STATUS_CODE) {
    super(message);
    this.status = status;
    this.statusCode = statusCode;
  }
}

export default ApplicationError;
