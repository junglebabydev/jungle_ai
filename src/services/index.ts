// Trimmed ServiceLocator for jungle_ai — ONLY the transitive service closure the
// AI assistants use (21 domains + the schedule-session orchestrator), computed from
// booking_system. Keep this in step with what the assistants actually call; adding a
// new tool that reaches a new service means registering that service (and copying its
// domain folder) here.

import { IMerchantChatConversationServiceInternal } from "./merchant-chat-conversation/service.interface";
import { MerchantChatConversationServiceInternal } from "./merchant-chat-conversation/service.internal";
import { IConciergeConversationServiceInternal } from "./concierge-conversation/service.interface";
import { ConciergeConversationServiceInternal } from "./concierge-conversation/service.internal";
import { IUSerService, IUserServiceInternal } from "./user/service.interface";
import { UserService } from "./user/service";
import { UserServiceInternal } from "./user/service.internal";
import { RoleService } from "./role/service";
import { RoleServiceInternal } from "./role/service.internal";
import { IRoleService, IRoleServiceInternal } from "./role/service.interface";
import { MerchantUserService } from "./merchant-user/service";
import { MerchantUserServiceInternal } from "./merchant-user/service.internal";
import {
  IMerchantUserService,
  IMerchantUserServiceInternal,
} from "./merchant-user/service.interface";
import { LocationUserService } from "./location-user/service";
import { LocationUserServiceInternal } from "./location-user/service.internal";
import {
  ILocationUserService,
  ILocationUserServiceInernal,
} from "./location-user/service.interface";
import { MerchantService } from "./merchant/service";
import { MerchantServiceInternal } from "./merchant/service.internal";
import {
  IMerchantService,
  IMerchantServiceInternal,
} from "./merchant/service.interafce";
import { LocationService } from "./location/service";
import { LocationServiceInternal } from "./location/service.internal";
import {
  ILocationService,
  ILocationServiceInternal,
} from "./location/service.interface";
import { RolePermissionServiceInternal } from "./role-permission/service.internal";
import { IRolePermissionServiceInternal } from "./role-permission/service.interface";
import { ProductCategoryService } from "./product-category/service";
import { IProductCategoryService } from "./product-category/service.interface";
import { ProductService } from "./product/service";
import { ProductServiceInternal } from "./product/service.internal";
import {
  IProductService,
  IProductServiceInternal,
} from "./product/service.interface";
import { ClassDetailsService } from "./class/service";
import { IClassDetailsService } from "./class/service.interface";
import { PricingService } from "./pricing/service";
import { PricingServiceInternal } from "./pricing/service.internal";
import {
  IPricingService,
  IPricingServiceInternal,
} from "./pricing/service.interface";
import { ScheduleService } from "./schedule/service";
import { ScheduleServiceInternal } from "./schedule/service.internal";
import {
  IScheduleService,
  IScheduleServiceInternal,
} from "./schedule/service.interface";
import { SessionService } from "./session/service";
import { SessionServiceInternal } from "./session/service.internal";
import {
  ISessionService,
  ISessionServiceInternal,
} from "./session/service.interface";
import { ScheduleSessionOrchestrator } from "../orchestration/schedule-session/schedule-session.orchestrator";
import { IScheduleSessionOrchestrator } from "../orchestration/schedule-session/schedule-session.orchestrator.interface";
import { PackageTemplateService } from "./package-template/service";
import { PackageTemplateServiceInternal } from "./package-template/service.internal";
import {
  IPackageTemplateService,
  IPackageTemplateServiceInternal,
} from "./package-template/service.interface";
import { CampDetailsService } from "./camp-details/service";
import { ICampDetailsService } from "./camp-details/service.interface";
import { CampOptionService } from "./camp-option/service";
import { ICampOptionService } from "./camp-option/service.interface";
import { BirthdayDetailsService } from "./birthday-details/service";
import { IBirthdayDetailsService } from "./birthday-details/service.interface";
import { DropInDetailsService } from "./drop-in-details/service";
import { IDropInDetailsService } from "./drop-in-details/service.interface";
import { WhatsappLinkService } from "./whatsapp-link/service";
import { WhatsappLinkServiceInternal } from "./whatsapp-link/service.internal";
import {
  IWhatsappLinkService,
  IWhatsappLinkServiceInternal,
} from "./whatsapp-link/service.interface";
import { WhatsappInboundJobService } from "./whatsapp-inbound-job/service";
import { WhatsappInboundJobServiceInternal } from "./whatsapp-inbound-job/service.internal";
import {
  IWhatsappInboundJobService,
  IWhatsappInboundJobServiceInternal,
} from "./whatsapp-inbound-job/service.interface";

export const ServiceLocator = {
  MerchantChatConversationService: {
    internal:
      MerchantChatConversationServiceInternal as IMerchantChatConversationServiceInternal,
  },
  ConciergeConversationService: {
    internal:
      ConciergeConversationServiceInternal as IConciergeConversationServiceInternal,
  },
  UserService: {
    public: UserService as IUSerService,
    internal: UserServiceInternal as IUserServiceInternal,
  },
  RoleService: {
    public: RoleService as IRoleService,
    internal: RoleServiceInternal as IRoleServiceInternal,
  },
  MerchantUserService: {
    public: MerchantUserService as IMerchantUserService,
    internal: MerchantUserServiceInternal as IMerchantUserServiceInternal,
  },
  LocationUserService: {
    public: LocationUserService as ILocationUserService,
    internal: LocationUserServiceInternal as ILocationUserServiceInernal,
  },
  MerchantService: {
    public: MerchantService as IMerchantService,
    internal: MerchantServiceInternal as IMerchantServiceInternal,
  },
  LocationService: {
    public: LocationService as ILocationService,
    internal: LocationServiceInternal as ILocationServiceInternal,
  },
  RolePermissionService: {
    internal: RolePermissionServiceInternal as IRolePermissionServiceInternal,
  },
  ProductCategoryService: {
    public: ProductCategoryService as IProductCategoryService,
  },
  ProductService: {
    public: ProductService as IProductService,
    internal: ProductServiceInternal as IProductServiceInternal,
  },
  ClassDetailsService: {
    public: ClassDetailsService as IClassDetailsService,
  },
  PricingService: {
    public: PricingService as IPricingService,
    internal: PricingServiceInternal as IPricingServiceInternal,
  },
  ScheduleService: {
    public: ScheduleService as IScheduleService,
    internal: ScheduleServiceInternal as IScheduleServiceInternal,
  },
  SessionService: {
    public: SessionService as ISessionService,
    internal: SessionServiceInternal as ISessionServiceInternal,
  },
  ScheduleSessionOrchestrator: {
    public: ScheduleSessionOrchestrator as IScheduleSessionOrchestrator,
  },
  PackageTemplateService: {
    public: PackageTemplateService as IPackageTemplateService,
    internal: PackageTemplateServiceInternal as IPackageTemplateServiceInternal,
  },
  CampDetailsService: {
    public: CampDetailsService as ICampDetailsService,
  },
  CampOptionService: {
    public: CampOptionService as ICampOptionService,
  },
  BirthdayDetailsService: {
    public: BirthdayDetailsService as IBirthdayDetailsService,
  },
  DropInDetailsService: {
    public: DropInDetailsService as IDropInDetailsService,
  },
  WhatsappLinkService: {
    public: WhatsappLinkService as IWhatsappLinkService,
    internal: WhatsappLinkServiceInternal as IWhatsappLinkServiceInternal,
  },
  WhatsappInboundJobService: {
    public: WhatsappInboundJobService as IWhatsappInboundJobService,
    internal:
      WhatsappInboundJobServiceInternal as IWhatsappInboundJobServiceInternal,
  },
};
