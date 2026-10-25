select pg_get_functiondef(oid)
from pg_proc
where proname = 'get_member_login_bundle';
